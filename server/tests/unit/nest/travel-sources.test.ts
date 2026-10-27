import { DatabaseService } from '../../../src/nest/database/database.service';
import { TravelSourcesService } from '../../../src/nest/travel-sources/travel-sources.service';
import { travelSourceBatchSchema, travelSourceImageBytesSchema, type TravelSourceBatch } from '@trek/shared';

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sourceId = '0123456789abcdef01234567';
vi.mock('../../../src/db/database', () => ({}));
const batch = (content = '湖边散步后去吃饭', collectedAt = '2026-10-06T10:00:00.000Z'): TravelSourceBatch => ({
  schema_version: 1,
  query: '都灵自然风光美食',
  collected_at: collectedAt,
  notes: [
    {
      url: `https://www.xiaohongshu.com/search_result/${sourceId}?xsec_token=public-link-token`,
      title: '都灵',
      author: null,
      published_at: null,
      collected_at: collectedAt,
      content,
      status: 'available',
      failure_reason: null,
    },
  ],
});

describe('travel source import', () => {
  let db: Database.Database;
  let service: TravelSourcesService;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(
      'CREATE TABLE travel_sources (user_id INTEGER, source_id TEXT, payload TEXT, collected_at TEXT, PRIMARY KEY(user_id, source_id))',
    );
    db.exec('CREATE TABLE travel_source_images (user_id INTEGER, source_id TEXT, image_id TEXT, content_type TEXT, data BLOB, PRIMARY KEY(user_id, source_id, image_id))');
    db.exec('CREATE TABLE travel_place_extractions (user_id INTEGER, source_id TEXT, payload TEXT, PRIMARY KEY(user_id, source_id)); CREATE TABLE travel_source_image_texts (user_id INTEGER, source_id TEXT, image_id TEXT, engine TEXT, text TEXT, read_at TEXT, PRIMARY KEY(user_id, source_id, image_id))');
    service = new TravelSourcesService(new DatabaseService(db));
  });
  afterEach(() => db.close());

  it('deduplicates note routes, strips URL query tokens and isolates owners', () => {
    expect(service.importBatch(1, batch())).toEqual({ imported: 1, updated: 0, skipped: 0 });
    expect(service.importBatch(1, batch())).toEqual({ imported: 0, updated: 0, skipped: 1 });
    expect(service.list(2)).toEqual([]);
    expect(service.list(1)[0].url).toBe(`https://www.xiaohongshu.com/explore/${sourceId}`);
    expect(service.list(1)[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
    service.importBatch(2, batch('第二个用户的内容'));
    expect(service.list(1)[0].content).toBe('湖边散步后去吃饭');
  });

  it('updates newer successful content but preserves it against failed or older refreshes', () => {
    service.importBatch(1, batch());
    expect(service.importBatch(1, batch('旧内容', '2026-10-05T10:00:00.000Z')).skipped).toBe(1);
    const failed = batch('', '2026-10-07T10:00:00.000Z');
    failed.notes[0] = { ...failed.notes[0], content: null, status: 'failed', failure_reason: 'timeout' };
    expect(service.importBatch(1, failed).skipped).toBe(1);
    expect(service.importBatch(1, batch('新内容', '2026-10-08T10:00:00.000Z')).updated).toBe(1);
    expect(service.list(1)[0].content).toBe('新内容');
  });

  it('preserves international source links and shares note identity across domains', () => {
    const international = batch();
    international.notes[0].url = `https://www.rednote.com/discovery/item/${sourceId}?xsec_token=test`;
    expect(service.importBatch(1, international).imported).toBe(1);
    expect(service.list(1)[0].url).toBe(`https://www.rednote.com/discovery/item/${sourceId}`);
    expect(service.list(1)[0].source_id).toBe(sourceId);
    expect(service.importBatch(1, batch('刷新内容', '2026-10-08T10:00:00.000Z')).updated).toBe(1);
    expect(service.list(1)).toHaveLength(1);
  });

  it('rejects an invalid batch before any note is written', () => {
    const input = batch();
    input.notes.push({ ...input.notes[0], url: 'https://example.com/notes' });
    expect(() => service.importBatch(1, input)).toThrow();
    expect(service.list(1)).toEqual([]);
  });

  it('stores image bytes privately, verifies the digest and preserves images on text-only refresh', () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9kAAAAASUVORK5CYII=', 'base64');
    const imageId = createHash('sha256').update(bytes).digest('hex');
    const input = batch();
    input.notes[0].images = [{ order: 1, image_id: imageId, filename: `${imageId}.png`, content_type: 'image/png', status: 'available', failure_reason: null }];
    service.importBatch(1, input);
    expect(() => service.saveImage(2, sourceId, imageId, bytes)).toThrow();
    expect(() => service.saveImage(1, sourceId, imageId, Buffer.from('<svg/>'))).toThrow();
    expect(() => service.saveImage(1, sourceId, imageId, Buffer.concat([bytes, bytes]))).toThrow();
    expect(service.saveImage(1, sourceId, imageId, bytes)).toEqual({ saved: true });
    service.saveImage(1, sourceId, imageId, bytes);
    expect(service.getImage(1, sourceId, imageId).data).toEqual(bytes);
    expect(() => service.getImage(2, sourceId, imageId)).toThrow();
    expect(() => service.getImage(1, '../other', imageId)).toThrow();
    service.importBatch(1, batch('文字更新', '2026-10-09T10:00:00.000Z'));
    expect(service.list(1)[0].images).toEqual(input.notes[0].images);
    expect(service.list(1)[0].saved_image_ids).toEqual([imageId]);
  });

  it('validates the raw binary upload contract before handling image data', () => {
    expect(travelSourceImageBytesSchema.safeParse(Buffer.from([1, 2, 3])).success).toBe(true);
    expect(travelSourceImageBytesSchema.safeParse('not binary').success).toBe(false);
    expect(travelSourceImageBytesSchema.safeParse(Buffer.alloc(0)).success).toBe(false);
    expect(travelSourceImageBytesSchema.safeParse(Buffer.alloc(8 * 1024 * 1024 + 1)).success).toBe(false);
  });

  it('rejects malformed URLs, absent content and excess notes without throwing from safeParse', () => {
    for (const url of [
      'not a url',
      'https://xiaohongshu.com.evil.test/explore/' + sourceId,
      'http://xiaohongshu.com/explore/' + sourceId,
    ]) {
      const input = batch();
      input.notes[0].url = url;
      expect(travelSourceBatchSchema.safeParse(input).success).toBe(false);
    }
    expect(travelSourceBatchSchema.safeParse(batch('')).success).toBe(false);
    const input = batch();
    input.notes = Array(101).fill(input.notes[0]);
    expect(travelSourceBatchSchema.safeParse(input).success).toBe(false);
  });
});
