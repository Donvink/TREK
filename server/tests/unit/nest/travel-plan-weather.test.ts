import type { StoredTravelSource, TravelPlaceExtraction } from '@trek/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { TravelPlanWeatherService } from '../../../src/nest/travel-sources/travel-plan-weather.service';
import { TravelPlansService } from '../../../src/nest/travel-sources/travel-plans.service';
import type { AssignmentsService } from '../../../src/nest/assignments/assignments.service';
import type { DayNotesService } from '../../../src/nest/day-notes/day-notes.service';
import type { MapsService } from '../../../src/nest/maps/maps.service';
import type { PlacesService } from '../../../src/nest/places/places.service';
import type { TransitService } from '../../../src/nest/transit/transit.service';
import type { TripsService } from '../../../src/nest/trips/trips.service';
import type { TravelProfileService } from '../../../src/nest/travel-sources/travel-profile.service';
import type { TravelMetricsService } from '../../../src/nest/travel-sources/travel-metrics.service';
import type { WeatherService } from '../../../src/nest/weather/weather.service';

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

describe('weather check and swaps on a generated plan', () => {
  let database: Database.Database;
  let db: DatabaseService;
  let plans: TravelPlansService;
  let weather: TravelPlanWeatherService;
  let forecast: ReturnType<typeof vi.fn>;
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
      CREATE TABLE day_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER, place_id INTEGER, order_index INTEGER);
    `);
    db = new DatabaseService(database);
    db.run('INSERT INTO travel_sources VALUES (1, ?, ?, ?)', note.source_id, JSON.stringify(note), note.collected_at);
    db.run('INSERT INTO travel_place_extractions VALUES (1, ?, ?)', note.source_id, JSON.stringify(extraction));
    nextPlace = 100;
    const trips = { create: vi.fn(() => { db.run('INSERT INTO days (trip_id, day_number) VALUES (7, 1)'); return { tripId: 7 }; }) };
    const places = { create: vi.fn(() => ({ id: ++nextPlace })) };
    const assignments = {
      createAssignment: vi.fn((dayId: number, placeId: number, _notes: null, opts: { orderIndex: number }) =>
        db.run('INSERT INTO day_assignments (day_id, place_id, order_index) VALUES (?, ?, ?)', dayId, placeId, opts.orderIndex)),
      deleteAssignment: vi.fn((id: number) => db.run('DELETE FROM day_assignments WHERE id = ?', id)),
    };
    const maps = { searchNominatim: vi.fn(async () => [{ lat: 45.07, lng: 7.68 }]) };
    const transit = { plan: vi.fn(async () => ({ provider: 'transitous', itineraries: [] })) };
    const profiles = { preferences: () => ({ likes: [], dislikes: [], avoid: [], walking: 'medium', visited: new Set() }) };
    plans = new TravelPlansService(
      db, maps as unknown as MapsService, transit as unknown as TransitService, trips as unknown as TripsService,
      places as unknown as PlacesService, assignments as unknown as AssignmentsService, { create: vi.fn() } as unknown as DayNotesService,
      profiles as unknown as TravelProfileService,
      { priceTestDue: () => false } as unknown as TravelMetricsService,
    );
    forecast = vi.fn(async () => ({ type: 'forecast', main: 'Rain', temp: 8, temp_min: 6, temp_max: 10, precipitation_probability_max: 90, description: '' }));
    weather = new TravelPlanWeatherService(db, plans, { get: forecast } as unknown as WeatherService, maps as unknown as MapsService, assignments as unknown as AssignmentsService);
  });
  afterEach(() => database.close());

  const generated = async () => {
    const { plan } = plans.create(1, { title: '都灵', origin: 'Bellinzona', destinations: ['Torino, Italy'], start_date: '2026-11-13', end_date: '2026-11-13', travellers: 2, focus: 'nature', pace: 'normal' });
    return plans.generate(1, plan.plan_id);
  };

  it('writes the indoor alternative into the trip unscheduled, and refuses a check before generation', async () => {
    const { plan: fresh } = plans.create(1, { title: 'x', origin: 'Bellinzona', destinations: ['Torino, Italy'], start_date: '2026-11-13', end_date: '2026-11-13', travellers: 1, focus: 'nature', pace: 'normal' });
    await expect(weather.check(1, fresh.plan_id)).rejects.toThrow('Generate the trip first');
    const detail = await generated();
    const superga = detail.pool.find((p) => p.name === 'Superga')!;
    const egizio = detail.pool.find((p) => p.name === 'Museo Egizio')!;
    expect(egizio.included).toBe(false);
    expect(detail.plan.days[0]).toMatchObject({ pool_keys: [superga.pool_key], rain_alternatives: { [superga.pool_key]: egizio.pool_key } });
    expect(Object.keys(detail.plan.place_ids!)).toHaveLength(2);
    expect(db.all('SELECT place_id FROM day_assignments')).toEqual([{ place_id: detail.plan.place_ids![superga.pool_key] }]);
  });

  it('checks the forecast, then swaps the outdoor visit in place when the traveller confirms', async () => {
    const detail = await generated();
    const superga = detail.pool.find((p) => p.name === 'Superga')!.pool_key;
    const egizio = detail.pool.find((p) => p.name === 'Museo Egizio')!.pool_key;
    const checked = await weather.check(1, detail.plan.plan_id);
    expect(forecast).toHaveBeenCalledWith('45.07', '7.68', '2026-11-13', 'zh');
    expect(checked.plan.weather!.days[0]).toMatchObject({ status: 'forecast', rainy: true, summary: '雨，6–10°C，降水概率 90%' });
    expect(checked.plan.weather!.days[0].swaps).toEqual([{ from_key: superga, from_name: 'Superga', to_key: egizio, to_name: 'Museo Egizio' }]);

    await expect(weather.apply(1, detail.plan.plan_id, 0, [{ from_key: superga, to_key: 'a'.repeat(16) }])).rejects.toThrow('Not a prepared alternative');
    await expect(weather.apply(1, detail.plan.plan_id, 5, [{ from_key: superga, to_key: egizio }])).rejects.toThrow('No such day');
    const applied = await weather.apply(1, detail.plan.plan_id, 0, [{ from_key: superga, to_key: egizio }]);
    expect(applied.plan.days[0].pool_keys).toEqual([egizio]);
    expect(applied.plan.weather!.days[0].swaps).toEqual([]);
    expect(db.all('SELECT place_id, order_index FROM day_assignments')).toEqual([{ place_id: detail.plan.place_ids![egizio], order_index: 0 }]);
    expect(db.all("SELECT kind FROM travel_preference_signals WHERE kind = 'weather_swap'")).toHaveLength(1);
    // The journeys out and home are kept as they were.
    expect(applied.plan.legs.map((leg) => `${leg.from_name}>${leg.to_name}`)).toEqual(detail.plan.legs.map((leg) => `${leg.from_name}>${leg.to_name}`));
  });

  it('leaves a visit alone once the traveller has moved it in the trip, and reports weather it cannot get', async () => {
    const detail = await generated();
    const superga = detail.pool.find((p) => p.name === 'Superga')!.pool_key;
    const egizio = detail.pool.find((p) => p.name === 'Museo Egizio')!.pool_key;
    db.run('DELETE FROM day_assignments');
    await expect(weather.apply(1, detail.plan.plan_id, 0, [{ from_key: superga, to_key: egizio }])).rejects.toThrow('changed in the trip');
    forecast.mockRejectedValueOnce(new Error('upstream down'));
    const checked = await weather.check(1, detail.plan.plan_id);
    expect(checked.plan.weather!.days[0]).toMatchObject({ status: 'unavailable', swaps: [] });
  });
});
