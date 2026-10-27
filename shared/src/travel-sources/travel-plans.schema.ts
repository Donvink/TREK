import type { TravelPlaceEvidence, TravelPlaceKind, TravelPlaceSentiment } from './travel-places.schema';

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const travelPlanFocuses = ['mixed', 'food', 'nature', 'culture'] as const;
export const travelPlanPaces = ['relaxed', 'normal', 'packed'] as const;
export type TravelPlanFocus = (typeof travelPlanFocuses)[number];
export type TravelPlanPace = (typeof travelPlanPaces)[number];

export const travelPlanCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    /** Where the trip starts and ends, e.g. "Bellinzona". */
    origin: z.string().trim().min(2).max(100),
    /** One to three cities, visited in this order. Names as used for extraction, e.g. "Torino, Italy". */
    destinations: z.array(z.string().trim().min(2).max(100)).min(1).max(3),
    start_date: isoDate,
    end_date: isoDate,
    travellers: z.number().int().min(1).max(10),
    focus: z.enum(travelPlanFocuses),
    pace: z.enum(travelPlanPaces),
  })
  .strict()
  .refine((plan) => plan.end_date >= plan.start_date, { message: 'End date before start date', path: ['end_date'] })
  .refine((plan) => (Date.parse(plan.end_date) - Date.parse(plan.start_date)) / 86_400_000 < 14, {
    message: 'At most 14 days',
    path: ['end_date'],
  });

export const travelPlanFocusSchema = z.object({ focus: z.enum(travelPlanFocuses) }).strict();

export const travelPoolDecisionSchema = z
  .object({
    pool_key: z.string().regex(/^[a-f0-9]{16}$/),
    decision: z.enum(['include', 'exclude']).nullable(),
  })
  .strict();

export type TravelPlanInput = z.infer<typeof travelPlanCreateSchema>;

/** One source note mentioning a pooled place. */
export interface TravelPoolMention {
  source_id: string;
  source_title: string;
  source_url: string;
  place_id: string;
  sentiment: TravelPlaceSentiment | null;
}

export interface TravelPoolPlace {
  pool_key: string;
  name: string;
  address: string | null;
  city: string;
  kind: TravelPlaceKind;
  lat: number | null;
  lng: number | null;
  /** `confirmed`: the user picked the map match. `candidate`: best unconfirmed match. `unknown`: no map match. */
  location_status: 'confirmed' | 'candidate' | 'unknown';
  osm_id: string | null;
  mentions: TravelPoolMention[];
  evidence: TravelPlaceEvidence[];
  warnings: string[];
  recommended: boolean;
  reasons: string[];
  decision: 'include' | 'exclude' | null;
  /** The decision if one was made, otherwise the recommendation. */
  included: boolean;
}

/** Three states every checked fact carries. */
export type TravelFactStatus = 'verified' | 'reference' | 'unverified';

export interface TravelLegCheck {
  day_index: number;
  date: string;
  from_name: string;
  to_name: string;
  status: TravelFactStatus;
  departure: string | null;
  arrival: string | null;
  duration_minutes: number | null;
  transfers: number | null;
  summary: string;
  check_url: string;
  checked_at: string;
}

export interface TravelPlanDay {
  day_index: number;
  date: string;
  city: string;
  pool_keys: string[];
}

export interface TravelPlan extends TravelPlanInput {
  plan_id: string;
  created_at: string;
  updated_at: string;
  trip_id: number | null;
  generated_at: string | null;
  days: TravelPlanDay[];
  legs: TravelLegCheck[];
  /** Pooled places left out of the day plan, with the reason. */
  unplaced: { pool_key: string; reason: string }[];
}

export interface TravelPlanDetail {
  plan: TravelPlan;
  pool: TravelPoolPlace[];
  /** Sources whose extraction city matches a destination, newest first. */
  sources: {
    source_id: string;
    title: string;
    city: string | null;
    extracted: boolean;
    extractor: 'rules' | 'llm' | null;
    stale: boolean;
  }[];
}

/** What the trip planner shows under a place that came from a guide. */
export interface TravelPlaceGuideEvidence {
  plan_id: string;
  pool_key: string;
  location_status: TravelPoolPlace['location_status'];
  mentions: TravelPoolMention[];
  evidence: TravelPlaceEvidence[];
  reasons: string[];
  warnings: string[];
  legs: TravelLegCheck[];
}
