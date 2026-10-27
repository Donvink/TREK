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
  /** Where the first ride leaves from and the last one arrives, when the timetable answered. */
  departure_stop?: TravelStop | null;
  arrival_stop?: TravelStop | null;
}

export interface TravelStop {
  name: string;
  lat: number;
  lng: number;
}

/** Where to sleep in one city: the suggested area, why, and the hotel once booked. */
export interface TravelStay {
  city: string;
  check_in: string;
  check_out: string;
  nights: number;
  day_indexes: number[];
  area: { name: string; lat: number; lng: number };
  reasons: string[];
  booking_url: string;
  maps_url: string;
  hotel: { name: string; address: string | null; lat: number; lng: number; place_id: number | null } | null;
}

export const travelHotelSchema = z
  .object({
    stay_index: z.number().int().min(0).max(2),
    query: z.string().trim().min(2).max(200),
  })
  .strict();

export interface TravelPlanDay {
  day_index: number;
  date: string;
  city: string;
  pool_keys: string[];
  /** Outdoor place on this day → the indoor place nearby to take in the rain. */
  rain_alternatives?: Record<string, string>;
}

export interface TravelWeatherSwap {
  from_key: string;
  from_name: string;
  to_key: string;
  to_name: string;
}

export interface TravelWeatherDay {
  day_index: number;
  date: string;
  city: string;
  /** `forecast` within the forecast window; `climate` is a same-date average, never a forecast. */
  status: 'forecast' | 'climate' | 'unavailable';
  summary: string;
  rainy: boolean;
  swaps: TravelWeatherSwap[];
}

export interface TravelWeatherCheck {
  checked_at: string;
  days: TravelWeatherDay[];
}

export const travelWeatherApplySchema = z
  .object({
    day_index: z.number().int().min(0).max(13),
    swaps: z
      .array(
        z.object({ from_key: z.string().regex(/^[a-f0-9]{16}$/), to_key: z.string().regex(/^[a-f0-9]{16}$/) }).strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

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
  /** TREK place id of every pooled place written into the trip, rain alternatives included. */
  place_ids?: Record<string, number>;
  weather?: TravelWeatherCheck | null;
  stays?: TravelStay[];
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
