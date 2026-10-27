import type { TravelLegCheck, TravelPlanDay, TravelPlanPace, TravelPoolPlace, TravelWalking } from '@trek/shared';
import type { TransitItinerary } from '../transit/transit.helpers';
import { PACE_PER_DAY } from './travel-pool';

export interface Point {
  lat: number;
  lng: number;
}

/** Below this a leg is walked, and the estimate is only a reference. Set by how much the traveller likes to walk. */
export const WALK_LIMIT_KM: Record<TravelWalking, number> = { low: 0.8, medium: 1.2, high: 2 };
const WALK_KMH = 4.5;
const ROUTE_FACTOR = 1.3;

export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function tripDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/** Days per destination, in visiting order; earlier destinations take the remainder. */
export function splitDays(dayCount: number, destinations: string[]): string[] {
  const out: string[] = [];
  destinations.forEach((city, i) => {
    const share = Math.floor(dayCount / destinations.length) + (i < dayCount % destinations.length ? 1 : 0);
    for (let n = 0; n < share; n++) out.push(city);
  });
  return out;
}

/** Visit order that keeps neighbours together: nearest neighbour from the place closest to the centre. */
export function nearestNeighbourOrder<T extends Point>(points: T[]): T[] {
  if (points.length < 3) return [...points];
  const centre = { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lng: points.reduce((s, p) => s + p.lng, 0) / points.length };
  const left = [...points];
  let current = left.reduce((best, p) => (distanceKm(p, centre) < distanceKm(best, centre) ? p : best));
  const order: T[] = [];
  while (left.length) {
    left.splice(left.indexOf(current), 1);
    order.push(current);
    if (!left.length) break;
    current = left.reduce((best, p) => (distanceKm(p, current) < distanceKm(best, current) ? p : best));
  }
  return order;
}

/**
 * Lay the included places out over the days. A day that starts or ends with a journey
 * between cities holds half as much. What does not fit, or has no map position, is
 * left out with the reason.
 */
export function distributeDays(
  dates: string[],
  destinations: string[],
  pool: TravelPoolPlace[],
  pace: TravelPlanPace,
): { days: TravelPlanDay[]; unplaced: { pool_key: string; reason: string }[] } {
  const cityOfDay = splitDays(dates.length, destinations);
  const perDay = PACE_PER_DAY[pace];
  const half = Math.max(1, Math.floor(perDay / 2));
  const days: TravelPlanDay[] = dates.map((date, i) => ({ day_index: i, date, city: cityOfDay[i], pool_keys: [] }));
  const unplaced: { pool_key: string; reason: string }[] = [];

  for (const city of destinations) {
    const cityDays = days.filter((day) => day.city === city);
    const places = pool.filter((p) => p.included && p.city === city);
    for (const p of places) if (p.lat === null || p.lng === null) unplaced.push({ pool_key: p.pool_key, reason: '地图位置未找到，未排入日程' });
    const ordered = nearestNeighbourOrder(places.filter((p): p is TravelPoolPlace & Point => p.lat !== null && p.lng !== null));
    const capacities = cityDays.map((day) => {
      const travelDay = day.day_index === 0 || day.day_index === days.length - 1 || days[day.day_index - 1]?.city !== day.city;
      return travelDay ? half : perDay;
    });
    let next = 0;
    cityDays.forEach((day, i) => {
      const remainingDays = cityDays.length - i;
      const take = Math.min(capacities[i], Math.ceil((ordered.length - next) / remainingDays));
      day.pool_keys = ordered.slice(next, next + take).map((p) => p.pool_key);
      next += take;
    });
    for (const p of ordered.slice(next)) unplaced.push({ pool_key: p.pool_key, reason: '行程已排满，未排入日程' });
  }
  return { days, unplaced };
}

export interface LegRequest {
  day_index: number;
  date: string;
  from_name: string;
  to_name: string;
  from: Point;
  to: Point;
  /** Local wall-clock time to search from, HH:MM. */
  time: string;
}

/** The journeys a plan needs: out from the origin, between cities, back home, and between neighbouring stops. */
export function legRequests(
  days: TravelPlanDay[],
  places: Map<string, TravelPoolPlace>,
  origin: { name: string; point: Point },
  cities: Map<string, Point>,
): LegRequest[] {
  const legs: LegRequest[] = [];
  days.forEach((day, i) => {
    const cityPoint = cities.get(day.city);
    const previousCity = i === 0 ? null : days[i - 1].city;
    if (cityPoint && i === 0) {
      legs.push({ day_index: day.day_index, date: day.date, from_name: origin.name, to_name: day.city, from: origin.point, to: cityPoint, time: '08:00' });
    } else if (cityPoint && previousCity && previousCity !== day.city && cities.get(previousCity)) {
      legs.push({ day_index: day.day_index, date: day.date, from_name: previousCity, to_name: day.city, from: cities.get(previousCity)!, to: cityPoint, time: '09:00' });
    }
    const stops = day.pool_keys.map((key) => places.get(key)).filter((p): p is TravelPoolPlace => !!p && p.lat !== null && p.lng !== null);
    stops.slice(1).forEach((stop, n) => {
      const from = stops[n];
      legs.push({
        day_index: day.day_index, date: day.date, from_name: from.name, to_name: stop.name,
        from: { lat: from.lat!, lng: from.lng! }, to: { lat: stop.lat!, lng: stop.lng! },
        time: `${String(10 + 2 * n).padStart(2, '0')}:00`,
      });
    });
    if (cityPoint && i === days.length - 1) {
      legs.push({ day_index: day.day_index, date: day.date, from_name: day.city, to_name: origin.name, from: cityPoint, to: origin.point, time: '16:00' });
    }
  });
  return legs;
}

/** The UTC offset of a zone on a date, as "+01:00", so a local wall-clock time can be queried. */
export function zoneOffset(date: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(`${date}T12:00:00Z`));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = name.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : '+00:00';
}

export function localClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function checkUrl(from: Point, to: Point): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=transit`;
}

/** A short walk needs no timetable; it is an estimate from the straight-line distance. */
export function walkCheck(leg: LegRequest, checkedAt: string, walking: TravelWalking = 'medium'): TravelLegCheck | null {
  const km = distanceKm(leg.from, leg.to);
  if (km > WALK_LIMIT_KM[walking]) return null;
  const minutes = Math.max(1, Math.round((km * ROUTE_FACTOR / WALK_KMH) * 60));
  return {
    day_index: leg.day_index, date: leg.date, from_name: leg.from_name, to_name: leg.to_name, status: 'reference',
    departure: null, arrival: null, duration_minutes: minutes, transfers: 0,
    summary: `步行约 ${minutes} 分钟（按直线距离估算）`, check_url: checkUrl(leg.from, leg.to), checked_at: checkedAt,
  };
}

/** Turn a timetable answer into a check: the first real connection is verified, none at all is not. */
export function transitCheck(leg: LegRequest, itineraries: TransitItinerary[] | null, timeZone: string, checkedAt: string): TravelLegCheck {
  const base = {
    day_index: leg.day_index, date: leg.date, from_name: leg.from_name, to_name: leg.to_name,
    check_url: checkUrl(leg.from, leg.to), checked_at: checkedAt,
  };
  const found = itineraries?.find((it) => it.legs.some((l) => l.mode !== 'WALK'));
  if (!found) {
    return {
      ...base, status: 'unverified', departure: null, arrival: null, duration_minutes: null, transfers: null,
      summary: itineraries === null ? '时刻表查询失败，请到官方网站确认' : '这一天查不到公共交通班次，请到官方网站确认',
    };
  }
  const lines = found.legs.filter((l) => l.mode !== 'WALK').map((l) => l.line ?? l.mode).filter(Boolean);
  return {
    ...base, status: 'verified',
    departure: localClock(found.startTime, timeZone),
    arrival: localClock(found.endTime, timeZone),
    duration_minutes: Math.round(found.duration / 60),
    transfers: found.transfers,
    summary: `${lines.join(' → ')}，${found.transfers ? `换乘 ${found.transfers} 次` : '直达'}`,
  };
}
