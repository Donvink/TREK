import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  StoredTravelSource,
  TravelLegCheck,
  TravelPlaceExtraction,
  TravelPlaceGuideEvidence,
  TravelPlan,
  TravelPlanDetail,
  TravelPlanFocus,
  TravelPlanInput,
  TravelPoolPlace,
} from '@trek/shared';
import { randomBytes } from 'node:crypto';
import { AssignmentsService } from '../assignments/assignments.service';
import { DatabaseService } from '../database/database.service';
import { DayNotesService } from '../day-notes/day-notes.service';
import { MapsService } from '../maps/maps.service';
import { PlacesService } from '../places/places.service';
import { TransitService } from '../transit/transit.service';
import { TripsService } from '../trips/trips.service';
import { buildPool, planCapacity } from './travel-pool';
import { TravelProfileService } from './travel-profile.service';
import type { TransitItinerary } from '../transit/transit.helpers';
import { distributeDays, legRequests, transitCheck, tripDates, walkCheck, zoneOffset, type LegRequest, type Point } from './travel-itinerary';

/** Every corridor in scope runs on Central European time. */
const CORRIDOR_ZONE = 'Europe/Zurich';
const STATUS_LABELS: Record<TravelLegCheck['status'], string> = { verified: '已核验', reference: '参考', unverified: '未核验' };

@Injectable()
export class TravelPlansService {
  constructor(
    private readonly db: DatabaseService,
    private readonly maps: MapsService,
    private readonly transit: TransitService,
    private readonly trips: TripsService,
    private readonly places: PlacesService,
    private readonly assignments: AssignmentsService,
    private readonly dayNotes: DayNotesService,
    private readonly profiles: TravelProfileService,
  ) {}

  private load(userId: number, planId: string): TravelPlan {
    if (!/^[a-f0-9]{16}$/.test(planId)) throw new BadRequestException('Invalid plan identity');
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_plans WHERE user_id = ? AND plan_id = ?', userId, planId);
    if (!row) throw new NotFoundException('Plan not found');
    return JSON.parse(row.payload);
  }

  private save(userId: number, plan: TravelPlan) {
    plan.updated_at = new Date().toISOString();
    this.db.run(
      'INSERT INTO travel_plans (user_id, plan_id, payload, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, plan_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      userId, plan.plan_id, JSON.stringify(plan), plan.updated_at,
    );
  }

  private signal(userId: number, planId: string, kind: string, payload: unknown) {
    this.db.run(
      'INSERT INTO travel_preference_signals (user_id, plan_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, planId, kind, JSON.stringify(payload), new Date().toISOString(),
    );
  }

  create(userId: number, input: TravelPlanInput): TravelPlanDetail {
    const now = new Date().toISOString();
    const plan: TravelPlan = {
      ...input, plan_id: randomBytes(8).toString('hex'), created_at: now, updated_at: now,
      trip_id: null, generated_at: null, days: [], legs: [], unplaced: [],
    };
    this.save(userId, plan);
    this.signal(userId, plan.plan_id, 'plan_created', { destinations: input.destinations, focus: input.focus, pace: input.pace, travellers: input.travellers });
    return this.detail(userId, plan.plan_id);
  }

  list(userId: number): TravelPlan[] {
    return this.db
      .all<{ payload: string }>('SELECT payload FROM travel_plans WHERE user_id = ? ORDER BY updated_at DESC', userId)
      .map((row) => JSON.parse(row.payload));
  }

  private pool(userId: number, plan: TravelPlan): { pool: TravelPoolPlace[]; sources: StoredTravelSource[]; extractions: TravelPlaceExtraction[] } {
    const sources = this.db
      .all<{ payload: string }>('SELECT payload FROM travel_sources WHERE user_id = ? ORDER BY collected_at DESC', userId)
      .map((row) => JSON.parse(row.payload) as StoredTravelSource);
    const extractions = this.db
      .all<{ payload: string }>('SELECT payload FROM travel_place_extractions WHERE user_id = ?', userId)
      .map((row) => JSON.parse(row.payload) as TravelPlaceExtraction);
    const decisions = new Map(
      this.db
        .all<{ pool_key: string; decision: 'include' | 'exclude' }>('SELECT pool_key, decision FROM travel_pool_decisions WHERE user_id = ? AND plan_id = ?', userId, plan.plan_id)
        .map((row) => [row.pool_key, row.decision]),
    );
    const capacity = planCapacity(tripDates(plan.start_date, plan.end_date).length, plan.pace);
    const preferences = this.profiles.preferences(userId);
    return { pool: buildPool({ sources, extractions, destinations: plan.destinations, focus: plan.focus, capacity, decisions, preferences }), sources, extractions };
  }

  detail(userId: number, planId: string): TravelPlanDetail {
    const plan = this.load(userId, planId);
    const { pool, sources, extractions } = this.pool(userId, plan);
    return {
      plan,
      pool,
      sources: sources
        .filter((source) => source.status === 'available')
        .map((source) => {
          const extraction = extractions.find((item) => item.source_id === source.source_id);
          return {
            source_id: source.source_id, title: source.title, city: extraction?.city ?? null, extracted: !!extraction,
            extractor: extraction?.extractor ?? (extraction ? 'rules' : null),
            stale: !!extraction && extraction.source_content_hash !== source.content_hash,
          };
        }),
    };
  }

  setFocus(userId: number, planId: string, focus: TravelPlanFocus): TravelPlanDetail {
    const plan = this.load(userId, planId);
    this.signal(userId, planId, 'focus_changed', { from: plan.focus, to: focus });
    plan.focus = focus;
    this.save(userId, plan);
    return this.detail(userId, planId);
  }

  decide(userId: number, planId: string, poolKey: string, decision: 'include' | 'exclude' | null): TravelPlanDetail {
    const plan = this.load(userId, planId);
    const place = this.pool(userId, plan).pool.find((item) => item.pool_key === poolKey);
    if (!place) throw new NotFoundException('Place not in this plan');
    if (decision) {
      this.db.run(
        'INSERT INTO travel_pool_decisions (user_id, plan_id, pool_key, decision, decided_at) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(user_id, plan_id, pool_key) DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at',
        userId, planId, poolKey, decision, new Date().toISOString(),
      );
    } else {
      this.db.run('DELETE FROM travel_pool_decisions WHERE user_id = ? AND plan_id = ? AND pool_key = ?', userId, planId, poolKey);
    }
    this.signal(userId, planId, 'pool_decision', { pool_key: poolKey, decision, recommended: place.recommended, kind: place.kind, name: place.name });
    this.save(userId, plan);
    return this.detail(userId, planId);
  }

  private async locate(query: string): Promise<Point | null> {
    try {
      const hit = (await this.maps.searchNominatim(query, undefined, 'background'))[0];
      return hit?.lat != null && hit?.lng != null ? { lat: hit.lat, lng: hit.lng } : null;
    } catch {
      return null;
    }
  }

  /**
   * Write the plan into a new TREK trip: the included places, each day's order, the
   * guide evidence beside every place, and a checked line for every journey.
   */
  async generate(userId: number, planId: string): Promise<TravelPlanDetail> {
    const plan = this.load(userId, planId);
    const { pool } = this.pool(userId, plan);
    const included = pool.filter((place) => place.included);
    if (!included.length) throw new BadRequestException('No places included');

    const dates = tripDates(plan.start_date, plan.end_date);
    const { days, unplaced } = distributeDays(dates, plan.destinations, pool, plan.pace);
    const byKey = new Map(pool.map((place) => [place.pool_key, place]));
    const placeNames = new Set(pool.map((place) => place.name));

    const originPoint = await this.locate(plan.origin);
    const cities = new Map<string, Point>();
    for (const city of plan.destinations) {
      const point = await this.locate(city);
      if (point) cities.set(city, point);
    }
    const checkedAt = new Date().toISOString();
    const { walking } = this.profiles.preferences(userId);
    const legs: TravelLegCheck[] = [];
    if (originPoint) {
      for (const leg of legRequests(days, byKey, { name: plan.origin, point: originPoint }, cities)) {
        const walk = walkCheck(leg, checkedAt, walking);
        if (walk) {
          legs.push(walk);
          continue;
        }
        legs.push(transitCheck(leg, await this.timetable(leg, userId), CORRIDOR_ZONE, checkedAt));
      }
    }

    // One write: a failure part way leaves no half-built trip behind.
    const tripId = this.db.transaction(() => {
      const { tripId } = this.trips.create(userId, {
        title: plan.title,
        description: `由攻略生成：${plan.destinations.join('、')}，${plan.travellers} 人。地点来自小红书帖子，交通按查询时间核验。`,
        start_date: plan.start_date,
        end_date: plan.end_date,
      });
      const tripDays = this.db.all<{ id: number }>('SELECT id FROM days WHERE trip_id = ? ORDER BY day_number ASC', tripId);
      const placeIds = new Map<string, number>();
      for (const place of included) {
        const created = this.places.create(String(tripId), {
          name: place.name,
          lat: place.lat ?? undefined,
          lng: place.lng ?? undefined,
          address: place.address ?? undefined,
          osm_id: place.osm_id ?? undefined,
          notes: `攻略依据：${place.mentions.length} 篇帖子。${place.location_status === 'confirmed' ? '' : '地图位置未经确认。'}`,
        }) as { id: number };
        placeIds.set(place.pool_key, created.id);
        const evidence: TravelPlaceGuideEvidence = {
          plan_id: plan.plan_id, pool_key: place.pool_key, location_status: place.location_status,
          mentions: place.mentions, evidence: place.evidence, reasons: place.reasons, warnings: place.warnings,
          legs: legs.filter((leg) => leg.from_name === place.name || leg.to_name === place.name),
        };
        this.db.run(
          'INSERT INTO travel_place_evidence (trip_id, place_id, user_id, plan_id, pool_key, payload) VALUES (?, ?, ?, ?, ?, ?)',
          tripId, created.id, userId, plan.plan_id, place.pool_key, JSON.stringify(evidence),
        );
      }
      days.forEach((day, i) => {
        const dayId = tripDays[i]?.id;
        if (!dayId) return;
        day.pool_keys.forEach((key, order) => {
          const placeId = placeIds.get(key);
          if (placeId) this.assignments.createAssignment(dayId, placeId, null, { orderIndex: order });
        });
        // Journeys between cities go on the day itself; walks and rides between stops sit with each place.
        legs.filter((leg) => leg.day_index === i && !(placeNames.has(leg.from_name) && placeNames.has(leg.to_name))).forEach((leg) => {
          const when = leg.departure ? `${leg.departure}–${leg.arrival}，` : '';
          // Arriving opens the day, going home closes it.
          const sortOrder = leg.to_name === plan.origin ? 9999 : -1;
          this.dayNotes.create(dayId, tripId, `${leg.from_name} → ${leg.to_name}｜${STATUS_LABELS[leg.status]}：${when}${leg.summary}`, leg.departure, '🚆', sortOrder);
        });
      });
      return tripId;
    });

    Object.assign(plan, { trip_id: tripId, generated_at: checkedAt, days, legs, unplaced });
    this.save(userId, plan);
    this.signal(userId, planId, 'trip_generated', { trip_id: tripId, included: included.map((place) => place.pool_key) });
    return this.detail(userId, planId);
  }

  /** Connections for a leg; null when the timetable could not be asked, which the check reports as unverified. */
  private async timetable(leg: LegRequest, userId: number): Promise<TransitItinerary[] | null> {
    const time = `${leg.date}T${leg.time}:00${zoneOffset(leg.date, CORRIDOR_ZONE)}`;
    try {
      return (await this.transit.plan({ from: `${leg.from.lat},${leg.from.lng}`, to: `${leg.to.lat},${leg.to.lng}`, time }, 'en', userId)).itineraries;
    } catch (err) {
      console.warn(`[travel-plans] timetable lookup failed for ${leg.from_name} → ${leg.to_name}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Guide evidence for one place of a trip the caller can open; null when the place did not come from a guide. */
  evidenceFor(userId: number, tripId: number, placeId: number): TravelPlaceGuideEvidence | null {
    if (!this.trips.canAccessTrip(tripId, userId)) throw new NotFoundException('Trip not found');
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_place_evidence WHERE trip_id = ? AND place_id = ?', tripId, placeId);
    return row ? JSON.parse(row.payload) : null;
  }
}
