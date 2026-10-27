import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { TravelLegCheck, TravelPlanDetail, TravelPlaceGuideEvidence, TravelWeatherCheck } from '@trek/shared';
import { AssignmentsService } from '../assignments/assignments.service';
import { DatabaseService } from '../database/database.service';
import { MapsService } from '../maps/maps.service';
import { WeatherService } from '../weather/weather.service';
import { legRequests } from './travel-itinerary';
import { TravelPlansService } from './travel-plans.service';
import { weatherDay, type WeatherReading } from './travel-weather';

/**
 * Checks a generated plan against the weather and, on the traveller's say-so, swaps a
 * wet day's outdoor visits for the indoor alternatives prepared at generation. Journeys
 * between cities, and the days around them, are never touched.
 */
@Injectable()
export class TravelPlanWeatherService {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: TravelPlansService,
    private readonly weather: WeatherService,
    private readonly maps: MapsService,
    private readonly assignments: AssignmentsService,
  ) {}

  async check(userId: number, planId: string): Promise<TravelPlanDetail> {
    const plan = this.plans.load(userId, planId);
    if (!plan.trip_id || !plan.days.length) throw new BadRequestException('Generate the trip first');
    const { pool } = this.plans.pool(userId, plan);
    const names = new Map(pool.map((place) => [place.pool_key, place.name]));
    const cityPoints = new Map<string, { lat: number; lng: number } | null>();
    const days = [];
    for (const day of plan.days) {
      if (!cityPoints.has(day.city)) {
        const hit = (await this.maps.searchNominatim(day.city, undefined, 'background').catch(() => []))[0];
        cityPoints.set(day.city, hit?.lat != null && hit?.lng != null ? { lat: hit.lat, lng: hit.lng } : null);
      }
      const point = cityPoints.get(day.city);
      let reading: WeatherReading | null = null;
      if (point) {
        try {
          reading = await this.weather.get(String(point.lat), String(point.lng), day.date, 'zh');
        } catch (err) {
          console.warn(`[travel-weather] ${day.city} ${day.date}: ${(err as Error).message}`);
        }
      }
      days.push(weatherDay(day, reading, names));
    }
    const check: TravelWeatherCheck = { checked_at: new Date().toISOString(), days };
    plan.weather = check;
    this.plans.save(userId, plan);
    return this.plans.detail(userId, planId);
  }

  /** Swap the given outdoor visits for their prepared alternatives, in place, and recheck that day's journeys. */
  async apply(userId: number, planId: string, dayIndex: number, swaps: { from_key: string; to_key: string }[]): Promise<TravelPlanDetail> {
    const plan = this.plans.load(userId, planId);
    const day = plan.days.find((d) => d.day_index === dayIndex);
    if (!plan.trip_id || !day) throw new BadRequestException('No such day');
    const tripId = plan.trip_id;
    for (const swap of swaps) {
      if (day.rain_alternatives?.[swap.from_key] !== swap.to_key || !day.pool_keys.includes(swap.from_key)) {
        throw new BadRequestException('Not a prepared alternative for this day');
      }
    }
    const tripDay = this.db.all<{ id: number }>('SELECT id FROM days WHERE trip_id = ? ORDER BY day_number ASC', tripId)[dayIndex];
    if (!tripDay) throw new ConflictException('The trip no longer has this day');

    this.db.transaction(() => {
      for (const swap of swaps) {
        const fromPlace = plan.place_ids?.[swap.from_key];
        const toPlace = plan.place_ids?.[swap.to_key];
        const assignment = this.db.get<{ id: number; order_index: number }>(
          'SELECT id, order_index FROM day_assignments WHERE day_id = ? AND place_id = ?', tripDay.id, fromPlace,
        );
        // Edited in the planner since: leave the traveller's version alone.
        if (!assignment || !toPlace) throw new ConflictException('This visit was changed in the trip; edit it there');
        this.assignments.deleteAssignment(assignment.id);
        this.assignments.createAssignment(tripDay.id, toPlace, null, { orderIndex: assignment.order_index });
        day.pool_keys = day.pool_keys.map((key) => (key === swap.from_key ? swap.to_key : key));
        delete day.rain_alternatives![swap.from_key];
      }
    });

    // The swapped day's walks and rides change; the journeys between cities do not.
    const { pool } = this.plans.pool(userId, plan);
    const byKey = new Map(pool.map((place) => [place.pool_key, place]));
    const stopLegs = await this.plans.checkLegs(legRequests([day], byKey, { name: plan.origin, point: { lat: 0, lng: 0 } }, new Map()), userId, new Date().toISOString());
    const names = new Set(pool.map((place) => place.name));
    const isStopLeg = (leg: TravelLegCheck) => names.has(leg.from_name) && names.has(leg.to_name);
    plan.legs = [...plan.legs.filter((leg) => leg.day_index !== dayIndex || !isStopLeg(leg)), ...stopLegs]
      .sort((a, b) => a.day_index - b.day_index);
    for (const key of day.pool_keys) {
      const placeId = plan.place_ids?.[key];
      const row = placeId ? this.db.get<{ payload: string }>('SELECT payload FROM travel_place_evidence WHERE trip_id = ? AND place_id = ?', tripId, placeId) : undefined;
      if (!row) continue;
      const evidence = JSON.parse(row.payload) as TravelPlaceGuideEvidence;
      const name = byKey.get(key)?.name;
      evidence.legs = plan.legs.filter((leg) => leg.from_name === name || leg.to_name === name);
      this.db.run('UPDATE travel_place_evidence SET payload = ? WHERE trip_id = ? AND place_id = ?', JSON.stringify(evidence), tripId, placeId);
    }
    if (plan.weather) {
      plan.weather.days = plan.weather.days.map((d) => (d.day_index === dayIndex ? { ...d, swaps: d.swaps.filter((s) => !swaps.some((x) => x.from_key === s.from_key)) } : d));
    }
    this.plans.save(userId, plan);
    this.plans.signal(userId, planId, 'weather_swap', { day_index: dayIndex, swaps });
    return this.plans.detail(userId, planId);
  }
}
