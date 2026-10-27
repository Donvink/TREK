import type { TravelLegCheck, TravelPlanDay, TravelPoolPlace } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { chooseArea, hotelLegRequests, planStays } from '../../../src/nest/travel-sources/travel-stays';

const place = (key: string, name: string, lat: number, lng: number, city = 'Torino'): TravelPoolPlace => ({
  pool_key: key, name, address: null, city, kind: 'restaurant', lat, lng, location_status: 'confirmed', osm_id: null,
  mentions: [], evidence: [], warnings: [], recommended: true, reasons: [], decision: null, included: true,
});
const station = { name: 'Torino Porta Nuova', lat: 45.0621, lng: 7.6787 };
const arrival = (to: string): TravelLegCheck => ({
  day_index: 0, date: '2026-11-13', from_name: 'Bellinzona', to_name: to, status: 'verified', departure: '08:02', arrival: '12:10',
  duration_minutes: 248, transfers: 2, summary: '', check_url: '', checked_at: '', arrival_stop: station,
});

describe('where to stay', () => {
  it('weighs the places against the arrival station and picks the better spot', () => {
    const near = [{ lat: 45.065, lng: 7.68 }, { lat: 45.066, lng: 7.681 }];
    const area = chooseArea(near, station)!;
    expect(area.avgKm).toBeLessThan(1);
    expect(area.stationKm).not.toBeNull();
    // Without a station the middle of the places is the answer.
    expect(chooseArea(near, null)!.point).toEqual({ lat: 45.0655, lng: 7.6805 });
    expect(chooseArea([], null)).toBeNull();
    expect(chooseArea([], station)!.point).toEqual({ lat: station.lat, lng: station.lng });
  });

  it('makes one stay per city with nights, dates and search links, and none for a day trip', () => {
    const places = new Map([['a', place('a', 'A', 45.07, 7.68)], ['b', place('b', 'B', 45.44, 12.33, 'Venezia')]]);
    const days: TravelPlanDay[] = [
      { day_index: 0, date: '2026-11-13', city: 'Torino', pool_keys: ['a'] },
      { day_index: 1, date: '2026-11-14', city: 'Torino', pool_keys: [] },
      { day_index: 2, date: '2026-11-15', city: 'Venezia', pool_keys: ['b'] },
    ];
    const stays = planStays(days, places, [arrival('Torino')], 2);
    expect(stays.map((s) => [s.city, s.check_in, s.check_out, s.nights, s.day_indexes])).toEqual([['Torino', '2026-11-13', '2026-11-15', 2, [0, 1]]]);
    expect(stays[0].reasons[0]).toMatch(/^距 Torino Porta Nuova 约 [\d.]+ km$/);
    expect(stays[0].booking_url).toBe('https://www.booking.com/searchresults.html?ss=Torino&checkin=2026-11-13&checkout=2026-11-15&group_adults=2&no_rooms=1');
    expect(stays[0].maps_url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/hotels\/@45\.\d{5},7\.\d{5},15z$/);
    expect(planStays([days[0]], places, [], 1)).toEqual([]);
  });

  it('checks the walk from the hotel to the first stop and back from the last', () => {
    const places = new Map([['a', place('a', 'A', 45.07, 7.68)], ['b', place('b', 'B', 45.072, 7.69)]]);
    const days: TravelPlanDay[] = [
      { day_index: 0, date: '2026-11-13', city: 'Torino', pool_keys: ['a', 'b'] },
      { day_index: 1, date: '2026-11-14', city: 'Torino', pool_keys: [] },
    ];
    const [stay] = planStays(days, places, [], 2);
    expect(hotelLegRequests(stay, days, places)).toEqual([]);
    const legs = hotelLegRequests({ ...stay, hotel: { name: 'Hotel X', address: null, lat: 45.071, lng: 7.685, place_id: 1 } }, days, places);
    expect(legs.map((l) => `${l.from_name}>${l.to_name}@${l.time}`)).toEqual(['Hotel X>A@09:00', 'B>Hotel X@18:00']);
  });
});
