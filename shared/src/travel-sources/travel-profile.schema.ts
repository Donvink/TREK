import { travelPlaceKinds } from './travel-places.schema';
import { travelPlanPaces } from './travel-plans.schema';

import { z } from 'zod';

export const travelWalkingLevels = ['low', 'medium', 'high'] as const;
export type TravelWalking = (typeof travelWalkingLevels)[number];

/** The traveller's own answers. Inferred preferences only land here once they accept a suggestion. */
export const travelProfileSchema = z
  .object({
    likes: z.array(z.enum(travelPlaceKinds)).max(travelPlaceKinds.length),
    dislikes: z.array(z.enum(travelPlaceKinds)).max(travelPlaceKinds.length),
    pace: z.enum(travelPlanPaces),
    walking: z.enum(travelWalkingLevels),
    /** Things to steer clear of, in the traveller's words: "不吃辣", "排长队". */
    avoid: z.array(z.string().trim().min(1).max(40)).max(10),
  })
  .strict()
  .refine((profile) => !profile.likes.some((kind) => profile.dislikes.includes(kind)), {
    message: 'A kind cannot be both liked and disliked',
    path: ['dislikes'],
  });
export type TravelProfile = z.infer<typeof travelProfileSchema>;

/** A preference the app thinks it has seen. Nothing changes until the traveller accepts it. */
export interface TravelProfileSuggestion {
  key: string;
  text: string;
  evidence: string;
  change:
    | { likes: TravelProfile['likes'][number] }
    | { dislikes: TravelProfile['dislikes'][number] }
    | { pace: TravelProfile['pace'] };
}

export interface TravelSignalView {
  id: number;
  plan_id: string;
  kind: string;
  summary: string;
  created_at: string;
}

export interface TravelProfileView {
  profile: TravelProfile | null;
  updated_at: string | null;
  suggestions: TravelProfileSuggestion[];
  signals: TravelSignalView[];
  /** Places on past generated trips; ranked lower in new plans. */
  visited_count: number;
}
