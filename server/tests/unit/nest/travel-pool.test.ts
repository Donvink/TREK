import type { ExtractedTravelPlace, StoredTravelSource, TravelPlaceExtraction, TravelPoolPlace } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { buildPool, planCapacity, poolKey } from '../../../src/nest/travel-sources/travel-pool';
import {
  distanceKm,
  distributeDays,
  legRequests,
  nearestNeighbourOrder,
  splitDays,
  transitCheck,
  tripDates,
  walkCheck,
  zoneOffset,
} from '../../../src/nest/travel-sources/travel-itinerary';
import type { TransitItinerary } from '../../../src/nest/transit/transit.helpers';

const source = (id: string, hash = 'h'): StoredTravelSource => ({
  url: `https://www.xiaohongshu.com/explore/${id}`, title: `帖子 ${id}`, author: null, published_at: null,
  collected_at: '2026-10-01T00:00:00.000Z', content: 'x', status: 'available', failure_reason: null,
  source_id: id, query: 'q', content_hash: hash,
});
const place = (name: string, extra: Partial<ExtractedTravelPlace> = {}): ExtractedTravelPlace => ({
  place_id: name.slice(0, 16).padEnd(16, '0'), name, kind: 'restaurant', address: null, name_evidence: name,
  features: [], prices: [], opening_hours: [], warnings: [], map_status: 'not_found', candidates: [],
  selected_candidate_id: null, confirmed_at: null, sentiment: 'positive', ...extra,
});
const located = (name: string, lat: number, lng: number, extra: Partial<ExtractedTravelPlace> = {}) => place(name, {
  map_status: 'candidates', candidates: [{ candidate_id: `node:${Math.round(lat * 1000)}`, name, address: '', lat, lng, match_basis: 'name', url: '' }], ...extra,
});
const extraction = (sourceId: string, places: ExtractedTravelPlace[], city = 'Torino, Italy'): TravelPlaceExtraction => ({
  version: 3, extractor: 'llm', source_id: sourceId, source_url: '', source_content_hash: 'h', city,
  extracted_at: '', places, stale: false,
});

describe('place pool', () => {
  const sources = [source('a'), source('b'), source('c', 'changed')];

  it('merges the same place across notes and explains each recommendation', () => {
    const pool = buildPool({
      sources,
      extractions: [
        extraction('a', [located('House Jia', 45.07, 7.68), place('Museo Egizio', { kind: 'museum' })]),
        extraction('b', [located('house jia', 45.07, 7.68, { sentiment: 'mixed' })]),
      ],
      destinations: ['Torino, Italy'], focus: 'food', capacity: 5, decisions: new Map(),
    });
    const jia = pool.find((p) => p.name === 'House Jia')!;
    expect(jia.mentions).toHaveLength(2);
    expect(jia.recommended).toBe(true);
    expect(jia.reasons).toEqual(expect.arrayContaining(['2 篇帖子提到', '1 篇正面评价', '符合「美食」侧重', '地图位置未经确认']));
    const museum = pool.find((p) => p.name === 'Museo Egizio')!;
    expect(museum.recommended).toBe(false);
    expect(museum.reasons).toContain('不属于「美食」侧重');
    expect(museum.reasons).toContain('地图位置未找到，无法排进路线');
    expect(pool[0]).toBe(jia);
  });

  it('honours decisions, skips stale or other-city notes and unconfirmed names', () => {
    const decided = poolKey(place('Bad Place'), 'Torino, Italy');
    const pool = buildPool({
      sources,
      extractions: [
        extraction('a', [place('Bad Place', { sentiment: 'negative' }), place('Short', { name_status: 'needs_confirmation' })]),
        extraction('b', [place('Elsewhere')], 'München, Germany'),
        extraction('c', [place('Stale Cafe')]),
      ],
      destinations: ['Torino, Italy'], focus: 'mixed', capacity: 5, decisions: new Map([[decided, 'include']]),
    });
    expect(pool.map((p) => p.name)).toEqual(['Bad Place']);
    expect(pool[0].recommended).toBe(false);
    expect(pool[0].reasons).toContain('1 篇负面评价');
    expect(pool[0].included).toBe(true);
  });

  it('stops recommending once the plan is full and says so', () => {
    const pool = buildPool({
      sources, extractions: [extraction('a', [place('One'), place('Two'), place('Three')])],
      destinations: ['Torino, Italy'], focus: 'mixed', capacity: 2, decisions: new Map(),
    });
    expect(pool.filter((p) => p.recommended)).toHaveLength(2);
    expect(pool.find((p) => !p.recommended)?.reasons).toContain('行程已排满，未优先推荐');
  });

  it('routes by an address match, but does not guess between same-name places', () => {
    const candidate = (id: string, basis: 'name' | 'address') => ({ candidate_id: id, name: 'n', address: '', lat: 45, lng: 7, match_basis: basis, url: '' });
    const pool = buildPool({
      sources,
      extractions: [extraction('a', [
        place('By Address', { candidates: [candidate('node:1', 'address')] }),
        place('Twins', { candidates: [candidate('node:2', 'name'), candidate('node:3', 'name')] }),
      ])],
      destinations: ['Torino, Italy'], focus: 'mixed', capacity: 5, decisions: new Map(),
    });
    expect(pool.find((p) => p.name === 'By Address')).toMatchObject({ location_status: 'candidate', lat: 45, osm_id: 'node:1' });
    const twins = pool.find((p) => p.name === 'Twins')!;
    expect(twins.location_status).toBe('unknown');
    expect(twins.reasons).toContain('有多个同名地图候选，需确认后才能排进路线');
  });

  it('ranks by the traveller profile, history and things to avoid, and says why', () => {
    const visitedKey = poolKey(place('Old Favourite'), 'Torino, Italy');
    const pool = buildPool({
      sources,
      extractions: [extraction('a', [
        place('Museo', { kind: 'museum' }),
        place('Spicy House', { evidence: [{ kind: 'text', image_id: null, image_order: null, quote: '超级辣的川菜' }] }),
        place('Old Favourite'),
        place('Bakery', { kind: 'cafe' }),
      ])],
      destinations: ['Torino, Italy'], focus: 'mixed', capacity: 10, decisions: new Map(),
      preferences: { likes: ['cafe'], dislikes: ['museum'], avoid: ['辣'], visited: new Set([visitedKey]) },
    });
    const byName = (name: string) => pool.find((p) => p.name === name)!;
    expect(pool[0].name).toBe('Bakery');
    expect(byName('Bakery').reasons).toContain('符合你的画像：喜欢咖啡馆');
    expect(byName('Museo')).toMatchObject({ recommended: false });
    expect(byName('Museo').reasons).toContain('你的画像：不太喜欢博物馆');
    expect(byName('Old Favourite')).toMatchObject({ recommended: false });
    expect(byName('Old Favourite').reasons).toContain('你之前的行程去过');
    expect(byName('Spicy House')).toMatchObject({ recommended: false });
    expect(byName('Spicy House').warnings).toContain('帖子提到你想避开的：辣');
  });

  it('keys a confirmed place by its map object and sizes plans by pace', () => {
    expect(poolKey(place('A', { selected_candidate_id: 'node:1' }), 'X')).toBe(poolKey(place('B', { selected_candidate_id: 'node:1' }), 'Y'));
    // One name match to the same map object merges differently written names; an address match does not.
    const match = (basis: 'name' | 'address') => ({ candidates: [{ candidate_id: 'node:7', name: '', address: '', lat: 1, lng: 1, match_basis: basis, url: '' }] });
    expect(poolKey(place('家 HOUSE JIA', match('name')), 'T')).toBe(poolKey(place('House Jia', match('name')), 'T'));
    expect(poolKey(place('Shop A', match('address')), 'T')).not.toBe(poolKey(place('Shop B', match('address')), 'T'));
    expect(planCapacity(1, 'normal')).toBe(2);
    expect(planCapacity(4, 'normal')).toBe(4 + 4 + 2 + 2);
    expect(planCapacity(3, 'relaxed')).toBe(3 + 1 + 1);
  });
});

const poolPlace = (key: string, name: string, lat: number | null, lng: number | null, city = 'Torino'): TravelPoolPlace => ({
  pool_key: key, name, address: null, city, kind: 'restaurant', lat, lng,
  location_status: lat === null ? 'unknown' : 'confirmed', osm_id: null, mentions: [], evidence: [], warnings: [],
  recommended: true, reasons: [], decision: null, included: true,
});

describe('day plan', () => {
  it('lists dates and splits days over destinations in order', () => {
    expect(tripDates('2026-09-10', '2026-09-13')).toEqual(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']);
    expect(splitDays(5, ['Milano', 'Venezia'])).toEqual(['Milano', 'Milano', 'Milano', 'Venezia', 'Venezia']);
  });

  it('keeps neighbours together and fills travel days at half pace', () => {
    const places = [
      poolPlace('a', 'A', 45.07, 7.68), poolPlace('b', 'B', 45.071, 7.681), poolPlace('c', 'C', 45.2, 7.9),
      poolPlace('d', 'D', 45.201, 7.901), poolPlace('e', 'E', 45.072, 7.682), poolPlace('f', 'F', 45.202, 7.902),
      poolPlace('g', 'G', null, null), { ...poolPlace('h', 'H', 45.0, 7.0), included: false },
    ];
    const { days, unplaced } = distributeDays(tripDates('2026-09-10', '2026-09-12'), ['Torino'], places, 'normal');
    expect(days.map((d) => d.pool_keys.length)).toEqual([2, 2, 2]);
    expect(unplaced).toEqual([{ pool_key: 'g', reason: '地图位置未找到，未排入日程' }]);
    expect(days.flatMap((d) => d.pool_keys)).not.toContain('h');
    const order = nearestNeighbourOrder(places.slice(0, 6).map((p) => ({ ...p, lat: p.lat!, lng: p.lng! })));
    const cluster = (key: string) => (['a', 'b', 'e'].includes(key) ? 1 : 2);
    expect(order.map((p) => cluster(p.pool_key)).join('')).toMatch(/^(1{3}2{3}|2{3}1{3})$/);
  });

  it('reports what does not fit', () => {
    const places = Array.from({ length: 5 }, (_, i) => poolPlace(`k${i}`, `P${i}`, 45 + i / 1000, 7));
    const { unplaced } = distributeDays(['2026-09-10'], ['Torino'], places, 'relaxed');
    expect(unplaced.filter((u) => u.reason === '行程已排满，未排入日程')).toHaveLength(4);
  });

  it('asks for the journey out, between stops, between cities and home', () => {
    const places = new Map([['a', poolPlace('a', 'A', 45.07, 7.68)], ['b', poolPlace('b', 'B', 45.08, 7.7, 'Torino')], ['c', poolPlace('c', 'C', 45.44, 12.33, 'Venezia')]]);
    const legs = legRequests(
      [{ day_index: 0, date: '2026-09-10', city: 'Torino', pool_keys: ['a', 'b'] }, { day_index: 1, date: '2026-09-11', city: 'Venezia', pool_keys: ['c'] }],
      places, { name: 'Bellinzona', point: { lat: 46.19, lng: 9.02 } },
      new Map([['Torino', { lat: 45.07, lng: 7.68 }], ['Venezia', { lat: 45.44, lng: 12.33 }]]),
    );
    expect(legs.map((l) => `${l.from_name}>${l.to_name}@${l.time}`)).toEqual([
      'Bellinzona>Torino@08:00', 'A>B@10:00', 'Torino>Venezia@09:00', 'Venezia>Bellinzona@16:00',
    ]);
  });

  it('marks walks as reference and turns timetables into verified or unverified checks', () => {
    const leg = { day_index: 0, date: '2026-09-10', from_name: 'A', to_name: 'B', from: { lat: 45.07, lng: 7.68 }, to: { lat: 45.072, lng: 7.682 }, time: '10:00' };
    const walk = walkCheck(leg, 'now')!;
    const longer = { ...leg, to: { lat: 45.083, lng: 7.68 } };
    expect(walkCheck(longer, 'now', 'high')?.status).toBe('reference');
    expect(walkCheck(longer, 'now', 'low')).toBeNull();
    expect(walk.status).toBe('reference');
    expect(walk.summary).toContain('步行约');
    const far = { ...leg, to: { lat: 46.19, lng: 9.02 } };
    expect(walkCheck(far, 'now')).toBeNull();
    expect(distanceKm(far.from, far.to)).toBeGreaterThan(100);

    const itinerary: TransitItinerary = {
      startTime: '2026-09-10T06:12:00Z', endTime: '2026-09-10T09:05:00Z', duration: 10380, transfers: 1, walkSeconds: 60,
      legs: [
        { mode: 'WALK', line: null } as TransitItinerary['legs'][number],
        { mode: 'RAIL', line: 'EC 12' } as TransitItinerary['legs'][number],
        { mode: 'RAIL', line: 'R 10012' } as TransitItinerary['legs'][number],
      ],
    };
    const verified = transitCheck(far, [itinerary], 'Europe/Zurich', 'now');
    expect(verified).toMatchObject({ status: 'verified', departure: '08:12', arrival: '11:05', duration_minutes: 173, transfers: 1 });
    expect(verified.summary).toBe('EC 12 → R 10012，换乘 1 次');
    expect(transitCheck(far, [], 'Europe/Zurich', 'now')).toMatchObject({ status: 'unverified', summary: '这一天查不到公共交通班次，请到官方网站确认' });
    expect(transitCheck(far, null, 'Europe/Zurich', 'now').summary).toContain('查询失败');
    expect(verified.check_url).toContain('travelmode=transit');
  });

  it('knows the Central European offset in summer and winter', () => {
    expect(zoneOffset('2026-09-10', 'Europe/Zurich')).toBe('+02:00');
    expect(zoneOffset('2026-12-10', 'Europe/Zurich')).toBe('+01:00');
  });
});
