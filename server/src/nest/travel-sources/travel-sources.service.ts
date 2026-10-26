import { DatabaseService } from '../database/database.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  travelSourceBatchSchema,
  type StoredTravelSource,
  type TravelSourceBatch,
  type TravelSourceImportResult,
} from '@trek/shared';

import { createHash } from 'node:crypto';

@Injectable()
export class TravelSourcesService {
  constructor(private readonly db: DatabaseService) {}

  list(userId: number): StoredTravelSource[] {
    const extractions = this.db.all<{ source_id: string; payload: string }>(
      'SELECT source_id, payload FROM travel_place_extractions WHERE user_id = ?', userId,
    );
    const images = this.db.all<{ source_id: string; image_id: string }>(
      'SELECT source_id, image_id FROM travel_source_images WHERE user_id = ?', userId,
    );
    return this.db
      .all<{
        payload: string;
      }>('SELECT payload FROM travel_sources WHERE user_id = ? ORDER BY collected_at DESC, source_id', userId)
      .map((row) => {
        const note: StoredTravelSource = JSON.parse(row.payload);
        const saved = extractions.find(extraction => extraction.source_id === note.source_id);
        const extraction = saved ? JSON.parse(saved.payload) : undefined;
        return { ...note, place_extraction: extraction ? { ...extraction, stale: extraction.source_content_hash !== note.content_hash } : undefined,
          saved_image_ids: images.filter(image => image.source_id === note.source_id).map(image => image.image_id) };
      });
  }

  saveImage(userId: number, sourceId: string, imageId: string, data: Buffer) {
    this.validateImageIds(sourceId, imageId);
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_sources WHERE user_id = ? AND source_id = ?', userId, sourceId);
    const note: StoredTravelSource | undefined = row ? JSON.parse(row.payload) : undefined;
    const image = note?.images?.find(item => item.image_id === imageId && item.status === 'available');
    if (!image) throw new NotFoundException('Image not associated with your source');
    if (!Buffer.isBuffer(data) || !data.length || data.length > 8 * 1024 * 1024) throw new BadRequestException('Invalid image size');
    const type = data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
      : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString()) ? 'image/gif'
      : data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!type || type !== image.content_type || createHash('sha256').update(data).digest('hex') !== imageId) {
      throw new BadRequestException('Image bytes do not match the manifest');
    }
    this.db.run('INSERT INTO travel_source_images (user_id, source_id, image_id, content_type, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, source_id, image_id) DO NOTHING', userId, sourceId, imageId, type, data);
    return { saved: true };
  }

  getImage(userId: number, sourceId: string, imageId: string) {
    this.validateImageIds(sourceId, imageId);
    const image = this.db.get<{ data: Buffer; content_type: string }>(
      'SELECT data, content_type FROM travel_source_images WHERE user_id = ? AND source_id = ? AND image_id = ?', userId, sourceId, imageId,
    );
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  private validateImageIds(sourceId: string, imageId: string) {
    if (!/^[a-f0-9]{24}$/.test(sourceId) || !/^[a-f0-9]{64}$/.test(imageId)) throw new BadRequestException('Invalid image identity');
  }

  importBatch(userId: number, input: TravelSourceBatch): TravelSourceImportResult {
    const batch = travelSourceBatchSchema.parse(input);
    return this.db.transaction(() => {
      const result = { imported: 0, updated: 0, skipped: 0 };
      for (const note of batch.notes) {
        const sourceUrl = new URL(note.url);
        const sourceId = sourceUrl.pathname.split('/').filter(Boolean).at(-1)!;
        const collectedAt = new Date(note.collected_at).toISOString();
        const previous = this.db.get<{ collected_at: string; payload: string }>(
          'SELECT collected_at, payload FROM travel_sources WHERE user_id = ? AND source_id = ?',
          userId,
          sourceId,
        );
        const stored: StoredTravelSource = {
          ...note,
          images: note.images ?? (previous ? JSON.parse(previous.payload).images : undefined),
          url: sourceUrl.hostname.endsWith('rednote.com')
            ? `https://www.rednote.com/discovery/item/${sourceId}`
            : `https://www.xiaohongshu.com/explore/${sourceId}`,
          collected_at: collectedAt,
          source_id: sourceId,
          query: batch.query,
          content_hash: note.content ? createHash('sha256').update(note.content).digest('hex') : null,
        };
        // An old export or a failed refresh must not destroy a successful read.
        if (
          previous &&
          (previous.collected_at > collectedAt ||
            (JSON.parse(previous.payload).status === 'available' && note.status !== 'available') ||
            previous.payload === JSON.stringify(stored))
        ) {
          result.skipped++;
          continue;
        }
        this.db.run(
          'INSERT INTO travel_sources (user_id, source_id, payload, collected_at) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(user_id, source_id) DO UPDATE SET payload = excluded.payload, collected_at = excluded.collected_at',
          userId,
          sourceId,
          JSON.stringify(stored),
          collectedAt,
        );
        if (previous) result.updated++;
        else result.imported++;
      }
      return result;
    });
  }
}
