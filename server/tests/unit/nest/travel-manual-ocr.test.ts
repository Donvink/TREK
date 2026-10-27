import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { travelManualNoteSchema, type TravelManualNote } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../src/nest/database/database.service';
import type { MapsService } from '../../../src/nest/maps/maps.service';
import type { TravelLlmService } from '../../../src/nest/travel-sources/travel-llm.service';
import { TravelOcrService } from '../../../src/nest/travel-sources/travel-ocr.service';
import { TravelPlacesService } from '../../../src/nest/travel-sources/travel-places.service';
import { TravelSourcesService } from '../../../src/nest/travel-sources/travel-sources.service';

vi.mock('../../../src/db/database', () => ({}));
vi.mock('../../../src/nest/maps/maps.service', () => ({ MapsService: class {} }));
vi.mock('../../../src/nest/travel-sources/travel-llm.service', () => ({ TravelLlmService: class {} }));
const env = vi.hoisted(() => ({ ocrUrl: undefined as string | undefined }));
const fetchAdmin = vi.hoisted(() => vi.fn());
vi.mock('../../../src/app-config', () => ({ readEnv: () => ({ integrations: { ocrUrl: env.ocrUrl } }) }));
vi.mock('../../../src/utils/ssrfGuard', () => ({ safeFetchAdminConfigured: fetchAdmin }));

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const pngId = createHash('sha256').update(png).digest('hex');
const note = (extra: Partial<TravelManualNote> = {}): TravelManualNote => ({
  title: '慕尼黑啤酒馆', content: '推荐 Augustiner Bräustuben，地址见图。', images: [{ order: 1, image_id: pngId, content_type: 'image/png' }], ...extra,
});
const answer = (status: number, body: string) => ({ ok: status < 400, status, text: async () => body });

describe('manual guide import and server OCR', () => {
  let database: Database.Database;
  let sources: TravelSourcesService;
  let places: TravelPlacesService;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE travel_sources (user_id INTEGER, source_id TEXT, payload TEXT, collected_at TEXT, PRIMARY KEY(user_id, source_id));
      CREATE TABLE travel_source_images (user_id INTEGER, source_id TEXT, image_id TEXT, content_type TEXT, data BLOB, PRIMARY KEY(user_id, source_id, image_id));
      CREATE TABLE travel_source_image_texts (user_id INTEGER, source_id TEXT, image_id TEXT, engine TEXT, text TEXT, read_at TEXT, PRIMARY KEY(user_id, source_id, image_id));
      CREATE TABLE travel_place_extractions (user_id INTEGER, source_id TEXT, payload TEXT, PRIMARY KEY(user_id, source_id));
    `);
    const db = new DatabaseService(database);
    sources = new TravelSourcesService(db);
    places = new TravelPlacesService(db, {} as MapsService, { config: () => null } as unknown as TravelLlmService, new TravelOcrService());
    env.ocrUrl = 'http://ocr:8000';
    fetchAdmin.mockReset();
  });
  afterEach(() => database.close());

  it('validates the manual note contract', () => {
    expect(travelManualNoteSchema.safeParse(note()).success).toBe(true);
    expect(travelManualNoteSchema.safeParse(note({ content: ' ' })).success).toBe(false);
    expect(travelManualNoteSchema.safeParse(note({ images: [note().images[0], note().images[0]] })).success).toBe(false);
  });

  it('keeps the note id from a Xiaohongshu link, falls back to the text, and drops foreign links', () => {
    const fromLink = sources.importManual(1, note({ link: 'https://www.xiaohongshu.com/discovery/item/6a24184d000000001002d000?xsec_token=x' }));
    expect(fromLink).toEqual({ source_id: '6a24184d000000001002d000', created: true });
    const stored = sources.list(1)[0];
    expect(stored).toMatchObject({ url: 'https://www.xiaohongshu.com/explore/6a24184d000000001002d000', query: '手动导入', status: 'available' });
    expect(stored.images?.[0]).toMatchObject({ filename: `${pngId}.png`, status: 'available' });
    expect(sources.importManual(1, note({ link: 'https://www.xiaohongshu.com/discovery/item/6a24184d000000001002d000' })).created).toBe(false);

    const short = sources.importManual(1, note({ title: '短链', link: 'https://xhslink.com/a/AbC123' }));
    expect(short.source_id).toMatch(/^[a-f0-9]{24}$/);
    expect(sources.list(1).find((s) => s.source_id === short.source_id)?.url).toBe('https://xhslink.com/a/AbC123');
    const foreign = sources.importManual(1, note({ title: '别处', link: 'https://evil.example/explore/6a24184d000000001002d000' }));
    expect(sources.list(1).find((s) => s.source_id === foreign.source_id)?.url).toBe('');
    expect(() => sources.importManual(1, note({ link: 'not a url' }))).toThrow('valid URL');
    expect(sources.list(2)).toEqual([]);

    expect(() => sources.remove(2, fromLink.source_id)).toThrow('Source not found');
    expect(sources.remove(1, fromLink.source_id)).toEqual({ deleted: true });
    expect(sources.list(1).some((s) => s.source_id === fromLink.source_id)).toBe(false);
    expect(() => sources.remove(1, 'nope')).toThrow('Invalid source identity');
  });

  it('reads saved images through the sidecar, only the ones without text, and survives failures', async () => {
    const { source_id: sourceId } = sources.importManual(1, note());
    sources.saveImage(1, sourceId, pngId, png);
    fetchAdmin.mockResolvedValueOnce(answer(200, JSON.stringify({ lines: ['Augustiner Bräustuben', 'Landsberger Str. 19', 7] })));
    expect(await places.readImageText(1, sourceId)).toEqual({ read: 1, failed: 0 });
    expect(fetchAdmin).toHaveBeenCalledWith('http://ocr:8000/ocr', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'image/png' } }), 0);
    expect(database.prepare('SELECT text FROM travel_source_image_texts').get()).toEqual({ text: 'Augustiner Bräustuben\nLandsberger Str. 19' });
    // Already read: nothing left to do unless one image is asked for by id.
    expect(await places.readImageText(1, sourceId)).toEqual({ read: 0, failed: 0 });
    fetchAdmin.mockResolvedValueOnce(answer(422, '{"error":"could not read image"}'));
    expect(await places.readImageText(1, sourceId, pngId)).toEqual({ read: 0, failed: 1 });
    fetchAdmin.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await places.readImageText(1, sourceId, pngId)).toEqual({ read: 0, failed: 1 });
    fetchAdmin.mockResolvedValueOnce(answer(200, 'x'.repeat(300 * 1024)));
    expect(await places.readImageText(1, sourceId, pngId)).toEqual({ read: 0, failed: 1 });
    fetchAdmin.mockResolvedValueOnce(answer(200, '{"lines":"not a list"}'));
    expect(await places.readImageText(1, sourceId, pngId)).toEqual({ read: 0, failed: 1 });

    await expect(places.readImageText(2, sourceId)).rejects.toThrow('Source not found');
    await expect(places.readImageText(1, sourceId, 'bad')).rejects.toThrow('Invalid image identity');
    env.ocrUrl = undefined;
    expect(await places.readImageText(1, sourceId, pngId)).toEqual({ read: 0, failed: 0 });
    expect(new TravelOcrService().enabled()).toBe(false);
    expect(await new TravelOcrService().read(png, 'image/png')).toBeNull();
  });
});
