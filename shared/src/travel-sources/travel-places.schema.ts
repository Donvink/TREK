import { z } from 'zod';

export const travelPlaceExtractionRequestSchema = z
  .object({
    city: z.string().trim().min(2).max(100),
    refresh_map: z.boolean().optional(),
  })
  .strict();
export const travelPlaceConfirmRequestSchema = z
  .object({
    candidate_id: z.string().regex(/^(?:node|way|relation):\d+$/),
  })
  .strict();

export const travelPlaceImageIdentitySchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    address: z.string().trim().min(5).max(500),
    image_id: z.string().regex(/^[a-f0-9]{64}$/),
    evidence: z.string().trim().min(5).max(1000),
  })
  .strict();

export interface TravelPlaceClaim {
  text: string;
  evidence: string;
  status: 'unverified';
}
/** Where in a note a place was found: a quoted line of the text, or text read from one image. */
export interface TravelPlaceEvidence {
  kind: 'text' | 'image';
  image_id: string | null;
  image_order: number | null;
  quote: string;
}
export const travelPlaceKinds = [
  'restaurant',
  'cafe',
  'bar',
  'attraction',
  'museum',
  'nature',
  'shop',
  'place',
] as const;
export type TravelPlaceKind = (typeof travelPlaceKinds)[number];
export type TravelPlaceSentiment = 'positive' | 'mixed' | 'negative';
export interface TravelMapCandidate {
  candidate_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  match_basis: 'name' | 'address';
  url: string;
}
export interface ExtractedTravelPlace {
  place_id: string;
  name: string;
  name_status?: 'source_only' | 'needs_confirmation';
  name_image_id?: string;
  kind: TravelPlaceKind;
  address: string | null;
  name_evidence: string;
  /** Present on model extractions (version 3); every entry is checked against the note. */
  evidence?: TravelPlaceEvidence[];
  sentiment?: TravelPlaceSentiment | null;
  features: TravelPlaceClaim[];
  prices: TravelPlaceClaim[];
  opening_hours: TravelPlaceClaim[];
  warnings: string[];
  map_status: 'candidates' | 'not_found' | 'failed' | 'needs_details';
  candidates: TravelMapCandidate[];
  selected_candidate_id: string | null;
  confirmed_at: string | null;
}
export interface TravelPlaceExtraction {
  version: 1 | 2 | 3;
  /** `rules` reads labelled names from the text only; `llm` also reads OCR text from the images. */
  extractor?: 'rules' | 'llm';
  model?: string | null;
  source_id: string;
  source_url: string;
  source_content_hash: string;
  city: string;
  extracted_at: string;
  places: ExtractedTravelPlace[];
  stale: boolean;
}
