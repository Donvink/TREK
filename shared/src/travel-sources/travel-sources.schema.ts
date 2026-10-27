import type { TravelPlaceExtraction } from './travel-places.schema';

import { z } from 'zod';

/** Raw image bytes, 1 B to 8 MB. */
export function isImageBytes(data: unknown): data is Uint8Array {
  return data instanceof Uint8Array && data.byteLength > 0 && data.byteLength <= 8 * 1024 * 1024;
}

/**
 * The binary upload body. Declared over `unknown` with a refinement rather than
 * `z.instanceof`, because the API docs build a JSON Schema from every request
 * body and a class check has no JSON Schema form; the check itself is the same.
 */
export const travelSourceImageBytesSchema = z.unknown().refine(isImageBytes, {
  message: 'Expected image bytes, at most 8 MB',
});

export const travelSourceUrlSchema = z
  .string()
  .url()
  .max(2048)
  .regex(
    /^https:\/\/(?:(?:www\.)?xiaohongshu\.com\/(?:explore|search_result)|(?:www\.)?rednote\.com\/(?:discovery\/item|explore|search_result))\/[a-f0-9]{24}\/?(?:\?[^#]*)?(?:#.*)?$/,
    'Expected a Xiaohongshu note URL',
  );

export const travelSourceImageSchema = z
  .object({
    order: z.number().int().min(1).max(30),
    image_id: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    filename: z
      .string()
      .regex(/^[a-f0-9]{64}\.(?:jpg|png|gif|webp)$/)
      .nullable(),
    content_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).nullable(),
    status: z.enum(['available', 'failed']),
    failure_reason: z.string().max(200).nullable(),
  })
  .strict()
  .refine(
    (image) =>
      image.status !== 'available' ||
      (!!image.image_id && !!image.filename && image.filename.startsWith(image.image_id + '.') && !!image.content_type),
    { message: 'Available images require an identity, filename and content type' },
  );

export const travelSourceNoteSchema = z
  .object({
    url: travelSourceUrlSchema,
    title: z.string().trim().max(500),
    author: z.string().trim().max(200).nullable(),
    published_at: z.string().trim().max(100).nullable(),
    collected_at: z.iso.datetime(),
    content: z.string().trim().max(20000).nullable(),
    status: z.enum(['available', 'missing', 'failed']),
    failure_reason: z.string().max(200).nullable(),
    images: z.array(travelSourceImageSchema).max(30).optional(),
  })
  .strict()
  .refine((note) => note.status !== 'available' || !!note.content, {
    message: 'Available notes must contain text',
    path: ['content'],
  })
  .refine((note) => note.status === 'available' || note.content === null, {
    message: 'Unavailable notes cannot contain usable text',
    path: ['content'],
  });

export const travelSourceBatchSchema = z
  .object({
    schema_version: z.literal(1),
    query: z.string().trim().min(1).max(200),
    collected_at: z.iso.datetime(),
    notes: z.array(travelSourceNoteSchema).max(100),
  })
  .strict();

/** Text read from one note image by OCR on the collector's machine. */
export const travelSourceImageTextSchema = z
  .object({
    engine: z.enum(['rapidocr']),
    text: z.string().max(4000),
  })
  .strict();

export type TravelSourceNote = z.infer<typeof travelSourceNoteSchema>;
export type TravelSourceBatch = z.infer<typeof travelSourceBatchSchema>;
export type StoredTravelSource = TravelSourceNote & {
  source_id: string;
  query: string;
  content_hash: string | null;
  saved_image_ids?: string[];
  /** Image ids that have OCR text stored. */
  read_image_ids?: string[];
  place_extraction?: TravelPlaceExtraction;
};
export interface TravelSourceImportResult {
  imported: number;
  updated: number;
  skipped: number;
}
