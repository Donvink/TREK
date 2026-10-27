import type {
  ExtractedTravelPlace,
  StoredTravelSource,
  TravelPlaceExtraction,
  TravelPlaceKind,
  TravelPlanFocus,
  TravelPlanPace,
  TravelPoolPlace,
} from '@trek/shared';
import { createHash } from 'node:crypto';
import { normalizeForMatch } from './llm-extract-places';

const FOCUS_KINDS: Record<TravelPlanFocus, TravelPlaceKind[]> = {
  mixed: [],
  food: ['restaurant', 'cafe', 'bar'],
  nature: ['nature', 'attraction'],
  culture: ['museum', 'attraction'],
};
const FOCUS_LABELS: Record<TravelPlanFocus, string> = { mixed: '综合', food: '美食', nature: '自然风光', culture: '人文艺术' };
export const PACE_PER_DAY: Record<TravelPlanPace, number> = { relaxed: 3, normal: 4, packed: 6 };

/**
 * Same place across notes: the confirmed map object, else the one map object its name
 * matched, else the normalised name in that city. An address match does not count: one
 * building can hold several shops.
 */
export function poolKey(place: ExtractedTravelPlace, city: string): string {
  const named = place.candidates.length === 1 && place.candidates[0].match_basis === 'name' ? place.candidates[0].candidate_id : null;
  const identity = place.selected_candidate_id ?? named ?? `${normalizeForMatch(place.name)}\0${normalizeForMatch(city)}`;
  return createHash('sha256').update(identity).digest('hex').slice(0, 16);
}

/** How many places the whole plan can hold: full days at the pace, travel days at half. */
export function planCapacity(dayCount: number, pace: TravelPlanPace): number {
  const perDay = PACE_PER_DAY[pace];
  if (dayCount <= 1) return Math.max(1, Math.floor(perDay / 2));
  return (dayCount - 2) * perDay + 2 * Math.max(1, Math.floor(perDay / 2));
}

interface PoolInput {
  sources: StoredTravelSource[];
  extractions: TravelPlaceExtraction[];
  destinations: string[];
  focus: TravelPlanFocus;
  capacity: number;
  decisions: Map<string, 'include' | 'exclude'>;
}

/**
 * Merge the places every matching note mentions, then recommend the best fit for the
 * focus until the plan is full. Every recommendation and every omission says why.
 */
export function buildPool({ sources, extractions, destinations, focus, capacity, decisions }: PoolInput): TravelPoolPlace[] {
  const wanted = new Set(destinations.map(normalizeForMatch));
  const pool = new Map<string, TravelPoolPlace>();
  const ambiguous = new Set<string>();

  for (const extraction of extractions) {
    if (!wanted.has(normalizeForMatch(extraction.city))) continue;
    const source = sources.find((note) => note.source_id === extraction.source_id);
    if (!source || extraction.source_content_hash !== source.content_hash) continue;
    for (const place of extraction.places) {
      if (place.name_status === 'needs_confirmation') continue;
      const key = poolKey(place, extraction.city);
      const chosen = place.candidates.find((candidate) => candidate.candidate_id === place.selected_candidate_id) ?? null;
      // Without a confirmation: an address match pins the building, which is enough to route by; a single
      // name match is trusted the same way; several same-name matches are not guessed between.
      const best = chosen ?? (place.candidates[0]?.match_basis === 'address' || place.candidates.length === 1 ? place.candidates[0] : null);
      const existing = pool.get(key);
      const mention = {
        source_id: source.source_id, source_title: source.title, source_url: source.url,
        place_id: place.place_id, sentiment: place.sentiment ?? null,
      };
      const evidence = place.evidence ?? [{ kind: 'text' as const, image_id: null, image_order: null, quote: place.name_evidence }];
      if (existing) {
        existing.mentions.push(mention);
        existing.evidence.push(...evidence);
        if (existing.location_status !== 'confirmed' && chosen) {
          Object.assign(existing, { lat: chosen.lat, lng: chosen.lng, osm_id: chosen.candidate_id, location_status: 'confirmed' });
        }
        existing.address ??= place.address;
        continue;
      }
      if (!best && place.candidates.length > 1) ambiguous.add(key);
      pool.set(key, {
        pool_key: key,
        name: place.name,
        address: place.address,
        city: extraction.city,
        kind: place.kind,
        lat: best?.lat ?? null,
        lng: best?.lng ?? null,
        location_status: chosen ? 'confirmed' : best ? 'candidate' : 'unknown',
        osm_id: best?.candidate_id ?? null,
        mentions: [mention],
        evidence: [...evidence],
        warnings: [...place.warnings],
        recommended: false,
        reasons: [],
        decision: null,
        included: false,
      });
    }
  }

  const focusKinds = FOCUS_KINDS[focus];
  const score = (place: TravelPoolPlace) => {
    const positives = place.mentions.filter((m) => m.sentiment === 'positive').length;
    const negatives = place.mentions.filter((m) => m.sentiment === 'negative').length;
    return (focusKinds.includes(place.kind) ? 3 : 0) + place.mentions.length + positives - 2 * negatives
      + (place.location_status === 'confirmed' ? 1 : 0);
  };
  const ranked = [...pool.values()].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  let slots = capacity;
  for (const place of ranked) {
    const positives = place.mentions.filter((m) => m.sentiment === 'positive').length;
    const negatives = place.mentions.filter((m) => m.sentiment === 'negative').length;
    place.reasons.push(place.mentions.length > 1 ? `${place.mentions.length} 篇帖子提到` : '1 篇帖子提到');
    if (positives) place.reasons.push(`${positives} 篇正面评价`);
    if (negatives) place.reasons.push(`${negatives} 篇负面评价`);
    if (focusKinds.length) {
      place.reasons.push(focusKinds.includes(place.kind) ? `符合「${FOCUS_LABELS[focus]}」侧重` : `不属于「${FOCUS_LABELS[focus]}」侧重`);
    }
    if (place.location_status === 'unknown') {
      place.reasons.push(ambiguous.has(place.pool_key) && place.location_status === 'unknown' ? '有多个同名地图候选，需确认后才能排进路线' : '地图位置未找到，无法排进路线');
    }
    else if (place.location_status === 'candidate') place.reasons.push('地图位置未经确认');

    const fits = negatives <= positives && (!focusKinds.length || focusKinds.includes(place.kind) || place.mentions.length > 1);
    place.recommended = fits && slots > 0;
    if (fits && slots <= 0) place.reasons.push('行程已排满，未优先推荐');
    if (place.recommended) slots--;
    place.decision = decisions.get(place.pool_key) ?? null;
    place.included = place.decision ? place.decision === 'include' : place.recommended;
  }
  return ranked;
}
