import type { TravelPlaceKind, TravelPlanDay, TravelPoolPlace, TravelWeatherDay } from '@trek/shared';
import { distanceKm } from './travel-itinerary';

/** Places that a wet day spoils. */
export const OUTDOOR_KINDS: TravelPlaceKind[] = ['nature', 'attraction'];
/** Places to go instead. */
export const INDOOR_KINDS: TravelPlaceKind[] = ['museum', 'cafe', 'restaurant', 'shop', 'bar'];
/** An alternative further than this is a different day, not a swap. */
export const ALTERNATIVE_MAX_KM = 5;

const WET = new Set(['Rain', 'Drizzle', 'Thunderstorm', 'Snow']);
const CONDITION: Record<string, string> = {
  Clear: '晴', Clouds: '多云', Rain: '雨', Drizzle: '毛毛雨', Snow: '雪', Thunderstorm: '雷暴', Fog: '雾', Mist: '雾',
};

/** The fields of a TREK weather answer this check reads. */
export interface WeatherReading {
  type: string;
  main: string;
  temp: number;
  temp_min?: number;
  temp_max?: number;
  precipitation_sum?: number;
  precipitation_probability_max?: number;
  error?: string;
}

/** Wet enough to move an outdoor visit: rain, snow or storm forecast, a 60 % chance, or 2 mm. */
export function isRainy(reading: WeatherReading): boolean {
  return reading.type === 'forecast' && (WET.has(reading.main)
    || (reading.precipitation_probability_max ?? 0) >= 60 || (reading.precipitation_sum ?? 0) >= 2);
}

export function describeWeather(reading: WeatherReading): string {
  const condition = CONDITION[reading.main] ?? reading.main;
  const temp = reading.temp_min !== undefined && reading.temp_max !== undefined
    ? `${Math.round(reading.temp_min)}–${Math.round(reading.temp_max)}°C` : `${Math.round(reading.temp)}°C`;
  const rain = reading.precipitation_probability_max !== undefined ? `，降水概率 ${Math.round(reading.precipitation_probability_max)}%` : '';
  return reading.type === 'climate' ? `历史同期约 ${temp}，${condition}（不是预报）` : `${condition}，${temp}${rain}`;
}

/**
 * For each outdoor place in the day plan, the nearest indoor place in the same city that
 * is not already on the plan and was not dropped. Each alternative serves one day only.
 */
export function rainAlternatives(days: TravelPlanDay[], pool: TravelPoolPlace[]): TravelPlanDay[] {
  const byKey = new Map(pool.map((place) => [place.pool_key, place]));
  const planned = new Set(days.flatMap((day) => day.pool_keys));
  const used = new Set<string>();
  return days.map((day) => {
    const alternatives: Record<string, string> = {};
    for (const key of day.pool_keys) {
      const place = byKey.get(key);
      if (!place || !OUTDOOR_KINDS.includes(place.kind) || place.lat === null || place.lng === null) continue;
      const from = { lat: place.lat, lng: place.lng };
      const best = pool
        .filter((other) => INDOOR_KINDS.includes(other.kind) && other.city === day.city && other.decision !== 'exclude'
          && other.lat !== null && other.lng !== null && !planned.has(other.pool_key) && !used.has(other.pool_key))
        .map((other) => ({ other, km: distanceKm(from, { lat: other.lat!, lng: other.lng! }) }))
        .filter(({ km }) => km <= ALTERNATIVE_MAX_KM)
        .sort((a, b) => a.km - b.km)[0];
      if (best) {
        alternatives[key] = best.other.pool_key;
        used.add(best.other.pool_key);
      }
    }
    return Object.keys(alternatives).length ? { ...day, rain_alternatives: alternatives } : day;
  });
}

/** The check for one day: what the sky looks like, and which swaps to offer if it looks wet. */
export function weatherDay(day: TravelPlanDay, reading: WeatherReading | null, names: Map<string, string>): TravelWeatherDay {
  const base = { day_index: day.day_index, date: day.date, city: day.city };
  if (!reading || reading.error) return { ...base, status: 'unavailable', summary: '暂时查不到这一天的天气', rainy: false, swaps: [] };
  const rainy = isRainy(reading);
  const swaps = rainy
    ? Object.entries(day.rain_alternatives ?? {})
      .filter(([from]) => day.pool_keys.includes(from))
      .map(([from, to]) => ({ from_key: from, from_name: names.get(from) ?? from, to_key: to, to_name: names.get(to) ?? to }))
    : [];
  return { ...base, status: reading.type === 'climate' ? 'climate' : 'forecast', summary: describeWeather(reading), rainy, swaps };
}
