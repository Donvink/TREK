import type { StoredTravelSource, TravelPlaceExtraction, TravelPlanInput } from '@trek/shared';
import { travelPlanCreateSchema } from '@trek/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { TravelLlmService, travelLlmCost, TRAVEL_LLM_BUDGET_USD } from '../../../src/nest/travel-sources/travel-llm.service';
import { TravelPlansService } from '../../../src/nest/travel-sources/travel-plans.service';
import type { AssignmentsService } from '../../../src/nest/assignments/assignments.service';
import type { DayNotesService } from '../../../src/nest/day-notes/day-notes.service';
import type { LlmConfigResolver } from '../../../src/nest/llm-parse/llm-config.resolver';
import type { MapsService } from '../../../src/nest/maps/maps.service';
import type { PlacesService } from '../../../src/nest/places/places.service';
import type { TransitService } from '../../../src/nest/transit/transit.service';
import type { TripsService } from '../../../src/nest/trips/trips.service';
import type { TravelProfileService } from '../../../src/nest/travel-sources/travel-profile.service';

vi.mock('../../../src/db/database', () => ({}));
const fetchLlm = vi.hoisted(() => vi.fn());
vi.mock('../../../src/utils/ssrfGuard', () => ({ safeFetchLlm: fetchLlm }));

const TABLES = `
  CREATE TABLE travel_sources (user_id INTEGER, source_id TEXT, payload TEXT, collected_at TEXT, PRIMARY KEY(user_id, source_id));
  CREATE TABLE travel_place_extractions (user_id INTEGER, source_id TEXT, payload TEXT, PRIMARY KEY(user_id, source_id));
  CREATE TABLE travel_plans (user_id INTEGER, plan_id TEXT, payload TEXT, updated_at TEXT, PRIMARY KEY(user_id, plan_id));
  CREATE TABLE travel_pool_decisions (user_id INTEGER, plan_id TEXT, pool_key TEXT, decision TEXT, decided_at TEXT, PRIMARY KEY(user_id, plan_id, pool_key));
  CREATE TABLE travel_preference_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, plan_id TEXT, kind TEXT, payload TEXT, created_at TEXT);
  CREATE TABLE travel_place_evidence (trip_id INTEGER, place_id INTEGER, user_id INTEGER, plan_id TEXT, pool_key TEXT, payload TEXT, PRIMARY KEY(trip_id, place_id));
  CREATE TABLE travel_llm_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, purpose TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL, created_at TEXT);
  CREATE TABLE days (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id INTEGER, day_number INTEGER);
`;

const input: TravelPlanInput = {
  title: '都灵四日', origin: 'Bellinzona', destinations: ['Torino, Italy'], start_date: '2026-09-10', end_date: '2026-09-12',
  travellers: 2, focus: 'food', pace: 'normal',
};
const note: StoredTravelSource = {
  url: 'https://www.xiaohongshu.com/explore/6a24184d000000001002d000', title: '都灵 中餐厅', author: null, published_at: null,
  collected_at: '2026-10-01T00:00:00.000Z', content: '正文', status: 'available', failure_reason: null,
  source_id: '6a24184d000000001002d000', query: 'q', content_hash: 'h',
};
const extracted = (name: string, lat: number | null, lng: number | null, osm = 0) => ({
  place_id: name.padEnd(16, '0').slice(0, 16), name, kind: 'restaurant' as const, address: null, name_evidence: name,
  evidence: [{ kind: 'image' as const, image_id: 'a'.repeat(64), image_order: 10, quote: name }],
  sentiment: 'positive' as const, features: [], prices: [], opening_hours: [], warnings: [],
  map_status: lat === null ? 'not_found' as const : 'candidates' as const,
  candidates: lat === null || lng === null ? [] : [{ candidate_id: `node:${osm}`, name, address: '', lat, lng, match_basis: 'name' as const, url: '' }],
  selected_candidate_id: lat === null ? null : `node:${osm}`, confirmed_at: null,
});
const extraction: TravelPlaceExtraction = {
  version: 3, extractor: 'llm', source_id: note.source_id, source_url: note.url, source_content_hash: 'h', city: 'Torino, Italy',
  extracted_at: '', stale: false,
  places: [extracted('House Jia', 45.07, 7.68, 1), extracted('Al Jazira', 45.0765, 7.682, 2), extracted('Far Trattoria', 45.2, 7.9, 3), extracted('Nowhere Bar', null, null)],
};

describe('travel plans', () => {
  let database: Database.Database;
  let db: DatabaseService;
  let service: TravelPlansService;
  let trips: { create: ReturnType<typeof vi.fn>; canAccessTrip: ReturnType<typeof vi.fn> };
  let places: { create: ReturnType<typeof vi.fn> };
  let assignments: { createAssignment: ReturnType<typeof vi.fn> };
  let notes: { create: ReturnType<typeof vi.fn> };
  let transit: { plan: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(TABLES);
    db = new DatabaseService(database);
    db.run('INSERT INTO travel_sources VALUES (1, ?, ?, ?)', note.source_id, JSON.stringify(note), note.collected_at);
    db.run('INSERT INTO travel_place_extractions VALUES (1, ?, ?)', note.source_id, JSON.stringify(extraction));
    let placeId = 100;
    trips = {
      create: vi.fn(() => {
        for (let n = 1; n <= 3; n++) db.run('INSERT INTO days (trip_id, day_number) VALUES (7, ?)', n);
        return { tripId: 7 };
      }),
      canAccessTrip: vi.fn((tripId: number, userId: number) => (userId === 1 ? { id: tripId } : undefined)),
    };
    places = { create: vi.fn(() => ({ id: ++placeId })) };
    assignments = { createAssignment: vi.fn() };
    notes = { create: vi.fn() };
    transit = {
      plan: vi.fn(async () => ({
        provider: 'transitous',
        itineraries: [{ startTime: '2026-09-10T06:12:00Z', endTime: '2026-09-10T09:05:00Z', duration: 10380, transfers: 1, walkSeconds: 0, legs: [{ mode: 'RAIL', line: 'EC 12' }] }],
      })),
    };
    const maps = { searchNominatim: vi.fn(async (q: string) => [q.startsWith('Bellinzona') ? { lat: 46.19, lng: 9.02 } : { lat: 45.07, lng: 7.68 }]) };
    service = new TravelPlansService(
      db, maps as unknown as MapsService, transit as unknown as TransitService, trips as unknown as TripsService,
      places as unknown as PlacesService, assignments as unknown as AssignmentsService, notes as unknown as DayNotesService,
      { preferences: () => ({ likes: [], dislikes: [], avoid: [], walking: 'medium', visited: new Set() }) } as unknown as TravelProfileService,
    );
  });
  afterEach(() => database.close());

  it('validates plan input', () => {
    expect(travelPlanCreateSchema.safeParse(input).success).toBe(true);
    expect(travelPlanCreateSchema.safeParse({ ...input, end_date: '2026-09-01' }).success).toBe(false);
    expect(travelPlanCreateSchema.safeParse({ ...input, end_date: '2026-10-10' }).success).toBe(false);
    expect(travelPlanCreateSchema.safeParse({ ...input, destinations: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });

  it('builds the pool for its destination, records decisions and focus changes as signals', () => {
    const detail = service.create(1, input);
    expect(detail.pool.map((p) => p.name)).toEqual(expect.arrayContaining(['House Jia', 'Al Jazira', 'Far Trattoria', 'Nowhere Bar']));
    expect(detail.sources[0]).toMatchObject({ source_id: note.source_id, extracted: true, extractor: 'llm', stale: false });
    const bar = detail.pool.find((p) => p.name === 'Nowhere Bar')!;
    const decided = service.decide(1, detail.plan.plan_id, bar.pool_key, 'exclude');
    expect(decided.pool.find((p) => p.name === 'Nowhere Bar')).toMatchObject({ decision: 'exclude', included: false });
    expect(service.decide(1, detail.plan.plan_id, bar.pool_key, null).pool.find((p) => p.name === 'Nowhere Bar')?.decision).toBeNull();
    expect(service.setFocus(1, detail.plan.plan_id, 'culture').plan.focus).toBe('culture');
    const kinds = db.all<{ kind: string }>('SELECT kind FROM travel_preference_signals ORDER BY id').map((r) => r.kind);
    expect(kinds).toEqual(['plan_created', 'pool_decision', 'pool_decision', 'focus_changed']);
    expect(() => service.decide(1, detail.plan.plan_id, 'f'.repeat(16), 'include')).toThrow('not in this plan');
    expect(() => service.detail(2, detail.plan.plan_id)).toThrow('Plan not found');
    expect(() => service.detail(1, 'not-an-id')).toThrow('Invalid plan identity');
    expect(service.list(1)).toHaveLength(1);
  });

  it('writes a TREK trip with day order, guide evidence and checked journeys', async () => {
    const { plan } = service.create(1, input);
    const detail = await service.generate(1, plan.plan_id);
    expect(detail.plan.trip_id).toBe(7);
    expect(places.create).toHaveBeenCalledTimes(4);
    expect(places.create).toHaveBeenCalledWith('7', expect.objectContaining({ name: 'House Jia', lat: 45.07, lng: 7.68, osm_id: 'node:1' }));
    expect(detail.plan.unplaced).toEqual([{ pool_key: expect.any(String), reason: '地图位置未找到，未排入日程' }]);
    expect(assignments.createAssignment).toHaveBeenCalledTimes(3);
    // Out and home are journeys between cities, so they become day notes; the stop-to-stop walk does not.
    expect(notes.create).toHaveBeenCalledWith(expect.any(Number), 7, expect.stringContaining('Bellinzona → Torino, Italy｜已核验：08:12–11:05'), '08:12', '🚆', -1);
    expect(notes.create).toHaveBeenCalledWith(expect.any(Number), 7, expect.stringContaining('Torino, Italy → Bellinzona'), expect.anything(), '🚆', 9999);
    // Three located places over three days: one a day, so only the journeys out and home.
    expect(detail.plan.days.map((day) => day.pool_keys.length)).toEqual([1, 1, 1]);
    expect(detail.plan.legs.map((leg) => leg.status)).toEqual(['verified', 'verified']);

    const placeId = places.create.mock.results[0].value.id;
    const evidence = service.evidenceFor(1, 7, placeId)!;
    expect(evidence.evidence[0].image_order).toBe(10);
    expect(evidence.mentions[0].source_title).toBe('都灵 中餐厅');
    expect(service.evidenceFor(1, 7, 99999)).toBeNull();
    expect(() => service.evidenceFor(2, 7, placeId)).toThrow('Trip not found');
  });

  it('leaves no half-built trip behind when writing a place fails', async () => {
    places.create.mockImplementationOnce(() => ({ id: 500 })).mockImplementationOnce(() => { throw new Error('disk full'); });
    const { plan } = service.create(1, input);
    await expect(service.generate(1, plan.plan_id)).rejects.toThrow('disk full');
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM days')?.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM travel_place_evidence')?.n).toBe(0);
    expect(service.detail(1, plan.plan_id).plan.trip_id).toBeNull();
  });

  it('marks journeys unverified when the timetable cannot answer, and refuses an empty plan', async () => {
    transit.plan.mockRejectedValue(new Error('down'));
    const { plan } = service.create(1, input);
    const detail = await service.generate(1, plan.plan_id);
    expect(detail.plan.legs.filter((leg) => leg.status === 'unverified').length).toBeGreaterThanOrEqual(2);
    expect(notes.create).toHaveBeenCalledWith(expect.any(Number), 7, expect.stringContaining('未核验'), null, '🚆', -1);

    for (const place of detail.pool) service.decide(1, plan.plan_id, place.pool_key, 'exclude');
    await expect(service.generate(1, plan.plan_id)).rejects.toThrow('No places included');
  });
});

describe('travel model spend', () => {
  let database: Database.Database;
  let db: DatabaseService;
  const resolver = { resolve: vi.fn() };

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(TABLES);
    db = new DatabaseService(database);
    fetchLlm.mockReset();
    resolver.resolve.mockReturnValue({ provider: 'openai', model: 'gemini-3.1-flash-lite', baseUrl: 'https://llm.example/v1/', apiKey: 'k', multimodal: true });
  });
  afterEach(() => database.close());

  const answer = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

  it('prices calls, records usage, retries once on overload, and reads fenced JSON', async () => {
    vi.useFakeTimers();
    fetchLlm
      .mockResolvedValueOnce(answer(503, 'overloaded'))
      .mockResolvedValueOnce(answer(200, { choices: [{ message: { content: '```json\n{"places":[]}\n```' } }], usage: { prompt_tokens: 4000, completion_tokens: 1000 } }));
    const llm = new TravelLlmService(db, resolver as unknown as LlmConfigResolver);
    const pending = llm.chatJson(1, 'extract-places', 'system', 'user', [{ mimeType: 'image/png', data: Buffer.from('x') }]);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();
    expect(result.json).toEqual({ places: [] });
    expect(fetchLlm).toHaveBeenCalledTimes(2);
    expect(fetchLlm.mock.calls[0][0]).toBe('https://llm.example/v1/chat/completions');
    const sent = JSON.parse(fetchLlm.mock.calls[0][1].body);
    expect(sent.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
    expect(result.costUsd).toBeCloseTo(travelLlmCost('gemini-3.1-flash-lite', 4000, 1000));
    expect(llm.spentUsd()).toBeCloseTo(0.0025);
  });

  it('refuses unpriced models, used-up budgets, failed calls and prose answers', async () => {
    const llm = new TravelLlmService(db, resolver as unknown as LlmConfigResolver);
    resolver.resolve.mockReturnValueOnce({ provider: 'openai', model: 'mystery-model', baseUrl: 'https://x', multimodal: false });
    expect(llm.config(1)).toBeNull();
    resolver.resolve.mockReturnValueOnce({ provider: 'anthropic', model: 'gemini-3.1-flash-lite', multimodal: false });
    await expect(llm.chatJson(1, 'p', 's', 'u')).rejects.toThrow('No priced');
    expect(() => travelLlmCost('mystery-model', 1, 1)).toThrow('No price');

    fetchLlm.mockResolvedValueOnce(answer(400, 'bad request'));
    await expect(llm.chatJson(1, 'p', 's', 'u')).rejects.toThrow('Model request failed (400)');
    fetchLlm.mockResolvedValueOnce(answer(200, { choices: [{ message: { content: 'Sorry, I cannot.' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    await expect(llm.chatJson(1, 'p', 's', 'u')).rejects.toThrow('not JSON');
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM travel_llm_usage')?.n).toBe(1);

    db.run('INSERT INTO travel_llm_usage (user_id, purpose, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (1, ?, ?, 0, 0, ?, ?)', 'p', 'm', TRAVEL_LLM_BUDGET_USD, 'now');
    await expect(llm.chatJson(1, 'p', 's', 'u')).rejects.toThrow('budget used up');
  });
});
