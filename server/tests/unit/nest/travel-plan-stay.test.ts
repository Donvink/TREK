import type { StoredTravelSource, TravelPlaceExtraction } from '@trek/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { TravelPlanStayService } from '../../../src/nest/travel-sources/travel-plan-stay.service';
import type { AccommodationsService } from '../../../src/nest/accommodations/accommodations.service';
import { TravelPlansService } from '../../../src/nest/travel-sources/travel-plans.service';
import type { AssignmentsService } from '../../../src/nest/assignments/assignments.service';
import type { DayNotesService } from '../../../src/nest/day-notes/day-notes.service';
import type { MapsService } from '../../../src/nest/maps/maps.service';
import type { PlacesService } from '../../../src/nest/places/places.service';
import type { TransitService } from '../../../src/nest/transit/transit.service';
import type { TripsService } from '../../../src/nest/trips/trips.service';
import type { TravelProfileService } from '../../../src/nest/travel-sources/travel-profile.service';
import type { TravelMetricsService } from '../../../src/nest/travel-sources/travel-metrics.service';

vi.mock('../../../src/db/database', () => ({}));

const note: StoredTravelSource = {
  url: '', title: '都灵自然', author: null, published_at: null, collected_at: '2026-10-01T00:00:00.000Z', content: 'x',
  status: 'available', failure_reason: null, source_id: 'f'.repeat(24), query: 'q', content_hash: 'h',
};
const located = (name: string, kind: 'nature' | 'museum', lat: number, osm: number) => ({
  place_id: name.padEnd(16, '0').slice(0, 16), name, kind, address: null, name_evidence: name,
  evidence: [{ kind: 'text' as const, image_id: null, image_order: null, quote: name }], sentiment: 'positive' as const,
  features: [], prices: [], opening_hours: [], warnings: [], map_status: 'candidates' as const,
  candidates: [{ candidate_id: `node:${osm}`, name, address: '', lat, lng: 7.7, match_basis: 'name' as const, url: '' }],
  selected_candidate_id: `node:${osm}`, confirmed_at: null,
});
const extraction: TravelPlaceExtraction = {
  version: 3, extractor: 'llm', source_id: note.source_id, source_url: '', source_content_hash: 'h', city: 'Torino, Italy',
  extracted_at: '', stale: false, places: [located('Superga', 'nature', 45.08, 1), located('Museo Egizio', 'museum', 45.068, 2)],
};

describe('booking a hotel for a generated plan', () => {
  let database: Database.Database;
  let db: DatabaseService;
  let plans: TravelPlansService;
  let stays: TravelPlanStayService;
  let search: ReturnType<typeof vi.fn>;
  let accommodations: { create: ReturnType<typeof vi.fn> };
  let nextPlace: number;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE travel_sources (user_id INTEGER, source_id TEXT, payload TEXT, collected_at TEXT, PRIMARY KEY(user_id, source_id));
      CREATE TABLE travel_place_extractions (user_id INTEGER, source_id TEXT, payload TEXT, PRIMARY KEY(user_id, source_id));
      CREATE TABLE travel_plans (user_id INTEGER, plan_id TEXT, payload TEXT, updated_at TEXT, PRIMARY KEY(user_id, plan_id));
      CREATE TABLE travel_pool_decisions (user_id INTEGER, plan_id TEXT, pool_key TEXT, decision TEXT, decided_at TEXT, PRIMARY KEY(user_id, plan_id, pool_key));
      CREATE TABLE travel_preference_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, plan_id TEXT, kind TEXT, payload TEXT, created_at TEXT);
      CREATE TABLE travel_place_evidence (trip_id INTEGER, place_id INTEGER, user_id INTEGER, plan_id TEXT, pool_key TEXT, payload TEXT, PRIMARY KEY(trip_id, place_id));
      CREATE TABLE days (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id INTEGER, day_number INTEGER);
    `);
    db = new DatabaseService(database);
    db.run('INSERT INTO travel_sources VALUES (1, ?, ?, ?)', note.source_id, JSON.stringify(note), note.collected_at);
    db.run('INSERT INTO travel_place_extractions VALUES (1, ?, ?)', note.source_id, JSON.stringify(extraction));
    nextPlace = 100;
    const trips = { create: vi.fn(() => { db.run('INSERT INTO days (trip_id, day_number) VALUES (7, 1), (7, 2)'); return { tripId: 7 }; }) };
    const places = { create: vi.fn(() => ({ id: ++nextPlace })) };
    search = vi.fn(async (q: string) => (q.startsWith('Bellinzona') ? [{ lat: 46.19, lng: 9.02 }] : [{ lat: 45.07, lng: 7.68 }]));
    const maps = {
      searchNominatim: search,
      reverseGeocode: vi.fn(async () => ({ name: 'Piazza Castello', address: '4, Piazza Castello, Centro, Torino, Italia' })),
    };
    const transit = { plan: vi.fn(async () => ({ provider: 'transitous', itineraries: [] })) };
    const profiles = { preferences: () => ({ likes: [], dislikes: [], avoid: [], walking: 'medium', visited: new Set() }) };
    plans = new TravelPlansService(
      db, maps as unknown as MapsService, transit as unknown as TransitService, trips as unknown as TripsService,
      places as unknown as PlacesService, { createAssignment: vi.fn() } as unknown as AssignmentsService, { create: vi.fn() } as unknown as DayNotesService,
      profiles as unknown as TravelProfileService,
      { priceTestDue: () => false } as unknown as TravelMetricsService,
    );
    accommodations = { create: vi.fn() };
    stays = new TravelPlanStayService(db, plans, maps as unknown as MapsService, places as unknown as PlacesService, accommodations as unknown as AccommodationsService);
  });
  afterEach(() => database.close());

  it('suggests a named area for the night, then anchors the stay and its walks on the booked hotel', async () => {
    const { plan } = plans.create(1, { title: '都灵', origin: 'Bellinzona', destinations: ['Torino, Italy'], start_date: '2026-11-13', end_date: '2026-11-14', travellers: 2, focus: 'nature', pace: 'normal' });
    const generated = await plans.generate(1, plan.plan_id);
    const [stay] = generated.plan.stays!;
    expect(stay).toMatchObject({ city: 'Torino, Italy', nights: 1, check_in: '2026-11-13', check_out: '2026-11-14', hotel: null });
    expect(stay.area.name).toBe('Centro, Torino, Italy');
    expect(stay.booking_url).toContain('ss=Centro%2C%20Torino%2C%20Italy');

    await expect(stays.setHotel(1, plan.plan_id, 3, 'Hotel X')).rejects.toThrow('No such stay');
    search.mockResolvedValueOnce([]);
    await expect(stays.setHotel(1, plan.plan_id, 0, 'Nowhere Inn')).rejects.toThrow('Hotel not found');

    search.mockResolvedValueOnce([{ lat: 45.0805, lng: 7.7, address: 'Strada Superga 1', osm_id: 'node:9' }]);
    const booked = await stays.setHotel(1, plan.plan_id, 0, 'Hotel Superga');
    expect(accommodations.create).toHaveBeenCalledWith(7, { place_id: nextPlace, start_day_id: 1, end_day_id: 2 });
    expect(booked.plan.stays![0].hotel).toMatchObject({ name: 'Hotel Superga', place_id: nextPlace });
    const hotelLegs = booked.plan.legs.filter((leg) => leg.from_name === 'Hotel Superga' || leg.to_name === 'Hotel Superga');
    expect(hotelLegs.map((leg) => `${leg.from_name}>${leg.to_name}:${leg.status}`)).toEqual(['Hotel Superga>Superga:reference', 'Superga>Hotel Superga:reference']);
    await expect(stays.setHotel(1, plan.plan_id, 0, 'Another')).rejects.toThrow('already set');
  });
});
