import { DatabaseService } from '../../../src/nest/database/database.service';
import { MapsService } from '../../../src/nest/maps/maps.service';
import { TravelPlacesService } from '../../../src/nest/travel-sources/travel-places.service';
import { TravelSourcesService } from '../../../src/nest/travel-sources/travel-sources.service';
import { extractTravelPlaces } from '../../../src/nest/travel-sources/extract-travel-places';
import type { TravelSourceBatch } from '@trek/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db/database', () => ({}));
vi.mock('../../../src/nest/maps/maps.service', () => ({ MapsService: class {} }));
const sourceId = '0123456789abcdef01234567';
const text = '午餐套餐 €12，蔬菜新鲜。\n店名：Test Bistrot\n地址：Via Test, 12, Torino\n\t\n咖啡和甜点三欧以下。\n店名：Test Caffè\n地址：Via Other, 8, Torino';
const batch = (content = text, date = '2026-10-07T10:00:00.000Z'): TravelSourceBatch => ({
  schema_version: 1, query: '都灵美食', collected_at: date,
  notes: [{ url: `https://www.rednote.com/discovery/item/${sourceId}`, title: '测试素材', author: null,
    published_at: null, collected_at: date, content, status: 'available', failure_reason: null }],
});
const candidate = { osm_id: 'node:123', name: 'Test Bistrot', address: 'Via Test, 12, Torino', lat: 45.07, lng: 7.69 };

describe('travel place extraction and source provenance', () => {
  let database: Database.Database;
  let sources: TravelSourcesService;
  let places: TravelPlacesService;
  let search: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    database = new Database(':memory:');
    database.exec('CREATE TABLE travel_sources (user_id INTEGER, source_id TEXT, payload TEXT, collected_at TEXT, PRIMARY KEY(user_id, source_id)); CREATE TABLE travel_source_images (user_id INTEGER, source_id TEXT, image_id TEXT); CREATE TABLE travel_place_extractions (user_id INTEGER, source_id TEXT, payload TEXT, PRIMARY KEY(user_id, source_id))');
    const db = new DatabaseService(database);
    sources = new TravelSourcesService(db);
    search = vi.fn().mockResolvedValue([candidate]);
    places = new TravelPlacesService(db, { searchNominatim: search } as unknown as MapsService);
    sources.importBatch(1, batch());
  });
  afterEach(() => database.close());

  it('keeps restaurant facts within their source block and preserves raw price wording', () => {
    const extracted = extractTravelPlaces(text);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].name).toBe('Test Bistrot');
    expect(extracted[0].prices.map(item => item.text)).toEqual(['€12']);
    expect(extracted[1].prices.map(item => item.text)).toEqual(['三欧以下']);
    expect(extracted[0].kind).toBe('restaurant');
    expect(extracted[1].kind).toBe('cafe');
    expect(extracted.flatMap(place => [...place.features, ...place.prices]).every(item => text.includes(item.evidence))).toBe(true);
  });

  it('extracts pinned or explicitly quoted names without inventing addresses or hours', () => {
    const pinned = extractTravelPlaces('套餐 €12。\n\t\n📍Test Bistrot\n营业时间似乎是白天，16:00关门。');
    expect(pinned[0].address).toBeNull();
    expect(pinned[0].opening_hours[0].text).toContain('似乎');
    const short = extractTravelPlaces('餐馆的名字是“家”，环境很好。');
    expect(short[0].name).toBe('家');
    expect(short[0].name_status).toBe('needs_confirmation');
    expect(short[0].warnings.join()).toContain('名称过于简短');
    expect(short[0].prices).toEqual([]);
    expect(extractTravelPlaces('这是一家很好吃的店，没有写名字。')).toEqual([]);
  });

  it('persists provenance and candidates without auto-confirming; caches unchanged results', async () => {
    const result = await places.extract(1, sourceId, 'Torino, Italy');
    expect(result.places).toHaveLength(2);
    expect(result.source_url).toBe(batch().notes[0].url);
    expect(result.places[0].selected_candidate_id).toBeNull();
    expect(result.places[0].candidates[0].url).toBe('https://www.openstreetmap.org/node/123');
    await places.extract(1, sourceId, 'Torino, Italy');
    expect(search).toHaveBeenCalledTimes(2);
    expect(sources.list(1)[0].place_extraction?.places).toHaveLength(2);
    await expect(places.extract(2, sourceId, 'Torino, Italy')).rejects.toThrow();
    expect(sources.list(2)).toEqual([]);
    expect(() => places.confirm(1, sourceId, result.places[0].place_id, 'node:999')).toThrow();
    expect(places.confirm(1, sourceId, result.places[0].place_id, 'node:123').places[0].confirmed_at).toBeTruthy();
    expect(() => places.confirm(2, sourceId, result.places[0].place_id, 'node:123')).toThrow();
  });

  it('marks address-only candidates and ambiguous search results for review', async () => {
    search.mockResolvedValueOnce([]).mockResolvedValueOnce([candidate, { ...candidate, osm_id: 'way:456' }]);
    const result = await places.extract(1, sourceId, 'Torino, Italy');
    expect(result.places[0].candidates[0].match_basis).toBe('address');
    expect(result.places[0].warnings.join()).toContain('尚未确认');
    expect(result.places[0].warnings.join()).toContain('多个地图候选');
  });

  it('retains source facts when maps fail and refuses stale confirmations', async () => {
    search.mockRejectedValue(new Error('Upstream unavailable'));
    const result = await places.extract(1, sourceId, 'Torino, Italy');
    expect(result.places[0].map_status).toBe('failed');
    expect(result.places[0].prices[0].status).toBe('unverified');
    sources.importBatch(1, batch('店名：New Shop\n地址：New Street', '2026-10-08T10:00:00.000Z'));
    expect(sources.list(1)[0].place_extraction?.stale).toBe(true);
    expect(() => places.confirm(1, sourceId, result.places[0].place_id, 'node:123')).toThrow();
  });

  it('flags street conflicts and accepts equivalent slash-style house numbers', async () => {
    sources.importBatch(1, batch('店名：Test Cafe\n地址：P.za Test, 24/b, Torino', '2026-10-08T10:00:00.000Z'));
    search.mockResolvedValue([{ ...candidate, address: '24b, Piazza Test, Torino' }]);
    const matching = await places.extract(1, sourceId, 'Torino, Italy');
    expect(matching.places[0].warnings).toEqual([]);
    search.mockResolvedValue([{ ...candidate, address: '24b, Via Test, Torino' }]);
    const conflicting = await places.extract(1, sourceId, 'Torino, Italy', true);
    expect(conflicting.places[0].warnings.join()).toContain('街道与原帖不一致');
    expect(conflicting.places[0].selected_candidate_id).toBeNull();
  });

  it('does not attach lookup results after a concurrent source change', async () => {
    search.mockImplementationOnce(async () => {
      sources.importBatch(1, batch('店名：Changed Shop', '2026-10-08T10:00:00.000Z'));
      return [candidate];
    });
    await expect(places.extract(1, sourceId, 'Torino, Italy')).rejects.toThrow('Source changed');
    expect(sources.list(1)[0].place_extraction).toBeUndefined();
  });

  it('keeps a confirmation made during a slow map refresh', async () => {
    const initial = await places.extract(1, sourceId, 'Torino, Italy');
    search.mockImplementationOnce(async () => {
      places.confirm(1, sourceId, initial.places[0].place_id, 'node:123');
      return [candidate];
    });
    const refreshed = await places.extract(1, sourceId, 'Torino, Italy', true);
    expect(refreshed.places[0].selected_candidate_id).toBe('node:123');
  });

  it('does not search for an ambiguous short name without an address', async () => {
    sources.importBatch(1, batch('餐馆的名字是“家”，环境很好。', '2026-10-08T10:00:00.000Z'));
    const result = await places.extract(1, sourceId, 'Torino, Italy');
    expect(result.places[0].map_status).toBe('needs_details');
    expect(result.places[0].name_status).toBe('needs_confirmation');
    expect(result.places[0].selected_candidate_id).toBeNull();
    expect(() => places.confirm(1, sourceId, result.places[0].place_id, 'node:123')).toThrow('Place identity needs confirmation');
    expect(search).not.toHaveBeenCalled();
  });

  it('replaces cached v1 results with a classified, unresolved name', async () => {
    sources.importBatch(1, batch('餐馆的名字是“家”，环境很好。', '2026-10-08T10:00:00.000Z'));
    const result = await places.extract(1, sourceId, 'Torino, Italy');
    database.prepare('UPDATE travel_place_extractions SET payload = ?').run(JSON.stringify({ ...result, version: 1, places: result.places.map(({ name_status: _status, ...place }) => place) }));
    const refreshed = await places.extract(1, sourceId, 'Torino, Italy');
    expect(refreshed.version).toBe(2);
    expect(refreshed.places[0].name_status).toBe('needs_confirmation');
    expect(search).not.toHaveBeenCalled();
  });

  it('retains reviewed image identity on refresh and rejects unrelated images or owners', async () => {
    const imageId = 'a'.repeat(64);
    const input = batch('餐馆的名字是“家”。', '2026-10-08T10:00:00.000Z');
    input.notes[0].images = [{ order: 1, image_id: imageId, filename: `${imageId}.png`, content_type: 'image/png', status: 'available', failure_reason: null }];
    sources.importBatch(1, input);
    const original = await places.extract(1, sourceId, 'Torino, Italy');
    const placeId = original.places[0].place_id;
    const correction = { name: 'Example Jia', address: 'Via Example, 4/A, Torino', image_id: imageId, evidence: '图片名片：Example Jia；Via Example, 4/A, Torino' };
    expect(() => places.correctIdentityFromImage(1, sourceId, placeId, correction)).toThrow('not saved');
    database.prepare('INSERT INTO travel_source_images VALUES (?, ?, ?)').run(1, sourceId, imageId);
    expect(() => places.correctIdentityFromImage(2, sourceId, placeId, correction)).toThrow();
    expect(() => places.correctIdentityFromImage(1, sourceId, placeId, { ...correction, image_id: 'b'.repeat(64) })).toThrow('does not belong');
    const corrected = places.correctIdentityFromImage(1, sourceId, placeId, correction);
    expect(corrected.places[0].name_image_id).toBe(imageId);
    const refreshed = await places.extract(1, sourceId, 'Torino, Italy', true);
    expect(refreshed.places[0].name).toBe('Example Jia');
    expect(refreshed.places[0].address).toBe(correction.address);
    expect(refreshed.places[0].name_evidence).toBe(correction.evidence);
    expect(refreshed.places[0].selected_candidate_id).toBeNull();
    expect(search).toHaveBeenCalledWith('Example Jia, Torino, Italy', 'it', 'background');
  });
});
