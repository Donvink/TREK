import type { TravelLegCheck, TravelPlanDay, TravelPoolPlace, TravelStay, TravelStop } from '@trek/shared';
import { distanceKm, type LegRequest, type Point } from './travel-itinerary';

/** Station distance weighs half of the average distance to the day's places. */
const STATION_WEIGHT = 0.5;

const round1 = (km: number) => Math.round(km * 10) / 10;

/** The day's sightseeing points in one city. */
function pointsOf(days: TravelPlanDay[], places: Map<string, TravelPoolPlace>): Point[] {
  return days.flatMap((day) => day.pool_keys)
    .map((key) => places.get(key))
    .filter((p): p is TravelPoolPlace => !!p && p.lat !== null && p.lng !== null)
    .map((p) => ({ lat: p.lat!, lng: p.lng! }));
}

/**
 * The best of three spots to sleep near: the middle of the places, the station the train
 * arrives at, or halfway between, scored by average distance to the places plus half the
 * distance to the station.
 */
export function chooseArea(points: Point[], station: TravelStop | null): { point: Point; avgKm: number; stationKm: number | null } | null {
  if (!points.length && !station) return null;
  const centre = points.length
    ? { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lng: points.reduce((s, p) => s + p.lng, 0) / points.length }
    : { lat: station!.lat, lng: station!.lng };
  const candidates: Point[] = station
    ? [centre, { lat: station.lat, lng: station.lng }, { lat: (centre.lat + station.lat) / 2, lng: (centre.lng + station.lng) / 2 }]
    : [centre];
  const avg = (c: Point) => (points.length ? points.reduce((s, p) => s + distanceKm(c, p), 0) / points.length : 0);
  const score = (c: Point) => avg(c) + (station ? STATION_WEIGHT * distanceKm(c, station) : 0);
  const best = candidates.reduce((a, b) => (score(b) < score(a) ? b : a));
  return { point: best, avgKm: avg(best), stationKm: station ? distanceKm(best, station) : null };
}

/**
 * One stay per run of days in a city that includes a night: the last day of the trip
 * sleeps at home, a city change sleeps in the next city. Areas are named by the caller.
 */
export function planStays(
  days: TravelPlanDay[],
  places: Map<string, TravelPoolPlace>,
  legs: TravelLegCheck[],
  travellers: number,
): TravelStay[] {
  const runs: TravelPlanDay[][] = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last && last[0].city === day.city) last.push(day);
    else runs.push([day]);
  }
  const stays: TravelStay[] = [];
  runs.forEach((run, i) => {
    const checkIn = run[0].date;
    const checkOut = runs[i + 1]?.[0].date ?? run.at(-1)!.date;
    const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
    if (nights <= 0) return;
    const city = run[0].city;
    const arrival = legs.find((leg) => leg.to_name === city && leg.status === 'verified' && leg.arrival_stop)?.arrival_stop ?? null;
    const area = chooseArea(pointsOf(run, places), arrival);
    if (!area) return;
    const reasons = [
      ...(arrival && area.stationKm !== null ? [`距 ${arrival.name} 约 ${round1(area.stationKm)} km`] : []),
      ...(pointsOf(run, places).length ? [`到这几天的地点平均约 ${round1(area.avgKm)} km`] : []),
    ];
    const search = encodeURIComponent(city);
    stays.push({
      city, check_in: checkIn, check_out: checkOut, nights, day_indexes: run.map((d) => d.day_index),
      area: { name: city, lat: area.point.lat, lng: area.point.lng }, reasons,
      booking_url: `https://www.booking.com/searchresults.html?ss=${search}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${travellers}&no_rooms=1`,
      maps_url: `https://www.google.com/maps/search/hotels/@${area.point.lat.toFixed(5)},${area.point.lng.toFixed(5)},15z`,
      hotel: null,
    });
  });
  return stays;
}

/** Mornings from the hotel to the first stop, evenings back from the last one. */
export function hotelLegRequests(stay: TravelStay, days: TravelPlanDay[], places: Map<string, TravelPoolPlace>): LegRequest[] {
  if (!stay.hotel) return [];
  const hotel = { lat: stay.hotel.lat, lng: stay.hotel.lng };
  return days.filter((day) => stay.day_indexes.includes(day.day_index)).flatMap((day) => {
    const stops = day.pool_keys.map((key) => places.get(key)).filter((p): p is TravelPoolPlace => !!p && p.lat !== null && p.lng !== null);
    if (!stops.length) return [];
    const first = stops[0];
    const last = stops.at(-1)!;
    return [
      { day_index: day.day_index, date: day.date, from_name: stay.hotel!.name, to_name: first.name, from: hotel, to: { lat: first.lat!, lng: first.lng! }, time: '09:00' },
      { day_index: day.day_index, date: day.date, from_name: last.name, to_name: stay.hotel!.name, from: { lat: last.lat!, lng: last.lng! }, to: hotel, time: '18:00' },
    ];
  });
}
