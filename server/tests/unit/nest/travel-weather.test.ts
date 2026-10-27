import type { TravelPlanDay, TravelPoolPlace } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { describeWeather, isRainy, rainAlternatives, weatherDay } from '../../../src/nest/travel-sources/travel-weather';

const place = (key: string, name: string, kind: TravelPoolPlace['kind'], lat: number | null, extra: Partial<TravelPoolPlace> = {}): TravelPoolPlace => ({
  pool_key: key, name, address: null, city: 'Torino', kind, lat, lng: lat === null ? null : 7.7, location_status: 'confirmed', osm_id: null,
  mentions: [], evidence: [], warnings: [], recommended: true, reasons: [], decision: null, included: true, ...extra,
});

describe('weather on a plan', () => {
  it('calls a day wet on rain, snow or storm, a 60 % chance or 2 mm, and only in the forecast window', () => {
    expect(isRainy({ type: 'forecast', main: 'Rain', temp: 10 })).toBe(true);
    expect(isRainy({ type: 'forecast', main: 'Clouds', temp: 10, precipitation_probability_max: 60 })).toBe(true);
    expect(isRainy({ type: 'forecast', main: 'Clouds', temp: 10, precipitation_sum: 2 })).toBe(true);
    expect(isRainy({ type: 'forecast', main: 'Clear', temp: 20, precipitation_probability_max: 10 })).toBe(false);
    expect(isRainy({ type: 'climate', main: 'Rain', temp: 10 })).toBe(false);
    expect(describeWeather({ type: 'forecast', main: 'Rain', temp: 9, temp_min: 6.2, temp_max: 11.8, precipitation_probability_max: 80 })).toBe('雨，6–12°C，降水概率 80%');
    expect(describeWeather({ type: 'climate', main: 'Clouds', temp: 12 })).toBe('历史同期约 12°C，多云（不是预报）');
  });

  it('prepares the nearest unused indoor place in the same city for each outdoor visit', () => {
    const pool = [
      place('superga', 'Superga', 'nature', 45.08), place('valentino', 'Valentino', 'attraction', 45.05),
      place('egizio', 'Museo Egizio', 'museum', 45.068, { included: false, recommended: false }),
      place('cafe', 'Caffè', 'cafe', 45.052, { included: false }),
      place('dropped', 'Dropped', 'museum', 45.0801, { decision: 'exclude', included: false }),
      place('far', 'Far Museum', 'museum', 46.2, { included: false }),
      place('milano', 'Milan Museum', 'museum', 45.0802, { city: 'Milano', included: false }),
      place('nowhere', 'Nowhere', 'museum', null, { included: false }),
    ];
    const days: TravelPlanDay[] = [
      { day_index: 0, date: '2026-11-13', city: 'Torino', pool_keys: ['superga'] },
      { day_index: 1, date: '2026-11-14', city: 'Torino', pool_keys: ['valentino', 'egizio'] },
    ];
    const out = rainAlternatives(days, pool);
    // Egizio is already on day 2, so Superga gets the café, and Valentino gets nothing left nearby.
    expect(out[0].rain_alternatives).toEqual({ superga: 'cafe' });
    expect(out[1].rain_alternatives).toBeUndefined();
  });

  it('offers swaps only on a wet forecast day, and says when the weather is unknown', () => {
    const day: TravelPlanDay = { day_index: 0, date: '2026-11-13', city: 'Torino', pool_keys: ['superga'], rain_alternatives: { superga: 'cafe', gone: 'x' } };
    const names = new Map([['superga', 'Superga'], ['cafe', 'Caffè']]);
    expect(weatherDay(day, { type: 'forecast', main: 'Rain', temp: 8 }, names).swaps).toEqual([{ from_key: 'superga', from_name: 'Superga', to_key: 'cafe', to_name: 'Caffè' }]);
    expect(weatherDay(day, { type: 'forecast', main: 'Clear', temp: 18 }, names).swaps).toEqual([]);
    expect(weatherDay(day, { type: 'climate', main: 'Rain', temp: 8 }, names)).toMatchObject({ status: 'climate', rainy: false, swaps: [] });
    expect(weatherDay(day, null, names)).toMatchObject({ status: 'unavailable', summary: '暂时查不到这一天的天气' });
    expect(weatherDay(day, { type: '', main: '', temp: 0, error: 'no_forecast' }, names).status).toBe('unavailable');
  });
});
