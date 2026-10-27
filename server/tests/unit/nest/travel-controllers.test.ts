import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../../src/types';
import { TravelPlansController } from '../../../src/nest/travel-sources/travel-plans.controller';
import { TravelProfileController } from '../../../src/nest/travel-sources/travel-profile.controller';
import { TravelSourcesController } from '../../../src/nest/travel-sources/travel-sources.controller';
import type { TravelMetricsService } from '../../../src/nest/travel-sources/travel-metrics.service';
import type { TravelPlanStayService } from '../../../src/nest/travel-sources/travel-plan-stay.service';
import type { TravelPlanWeatherService } from '../../../src/nest/travel-sources/travel-plan-weather.service';
import type { TravelPlansService } from '../../../src/nest/travel-sources/travel-plans.service';
import type { TravelPlacesService } from '../../../src/nest/travel-sources/travel-places.service';
import type { TravelProfileService } from '../../../src/nest/travel-sources/travel-profile.service';
import type { TravelSourcesService } from '../../../src/nest/travel-sources/travel-sources.service';

vi.mock('../../../src/db/database', () => ({}));
vi.mock('../../../src/nest/maps/maps.service', () => ({ MapsService: class {} }));

const user = { id: 7 } as User;
const planId = 'a'.repeat(16);
const sourceId = 'b'.repeat(24);
const imageId = 'c'.repeat(64);
const stub = <T>(methods: string[]) => Object.fromEntries(methods.map((m) => [m, vi.fn(() => m)])) as unknown as T;

describe('travel controllers hand each request to the right service', () => {
  it('plans', async () => {
    const plans = stub<TravelPlansService>(['list', 'create', 'detail', 'setFocus', 'decide', 'generate', 'evidenceFor', 'load']);
    const weather = stub<TravelPlanWeatherService>(['check', 'apply']);
    const stays = stub<TravelPlanStayService>(['setHotel']);
    const metrics = stub<TravelMetricsService>(['summary', 'answerPriceTest']);
    const c = new TravelPlansController(plans, weather, stays, metrics);
    expect(c.list(user)).toEqual({ plans: 'list' });
    const input = { title: 't', origin: 'o', destinations: ['d'], start_date: '2026-11-13', end_date: '2026-11-14', travellers: 2, focus: 'food', pace: 'normal' } as never;
    c.create(user, input);
    expect(plans.create).toHaveBeenCalledWith(7, input);
    expect(c.metricsSummary()).toBe('summary');
    expect(c.evidence(user, 3, 4)).toBe('evidenceFor');
    vi.mocked(plans.evidenceFor).mockReturnValueOnce(null);
    expect(() => c.evidence(user, 3, 5)).toThrow(NotFoundException);
    c.detail(user, planId);
    c.focus(user, planId, { focus: 'nature' } as never);
    expect(plans.setFocus).toHaveBeenCalledWith(7, planId, 'nature');
    c.decide(user, planId, { pool_key: 'k', decision: 'exclude' } as never);
    expect(plans.decide).toHaveBeenCalledWith(7, planId, 'k', 'exclude');
    await c.weatherCheck(user, planId);
    await c.weatherApply(user, planId, { day_index: 1, swaps: [{ from_key: 'f', to_key: 't' }] } as never);
    expect(weather.apply).toHaveBeenCalledWith(7, planId, 1, [{ from_key: 'f', to_key: 't' }]);
    await c.setHotel(user, planId, { stay_index: 0, query: 'NH' } as never);
    expect(stays.setHotel).toHaveBeenCalledWith(7, planId, 0, 'NH');
    c.answerPriceTest(user, planId, { choice: 'would_pay' } as never);
    expect(plans.load).toHaveBeenCalledWith(7, planId);
    expect(metrics.answerPriceTest).toHaveBeenCalledWith(7, planId, 'would_pay');
    await c.generate(user, planId);
    expect(plans.generate).toHaveBeenCalledWith(7, planId);
  });

  it('sources', async () => {
    const sources = stub<TravelSourcesService>(['list', 'importBatch', 'importManual', 'saveImage', 'getImage', 'remove']);
    const places = stub<TravelPlacesService>(['extract', 'confirm', 'correctIdentityFromImage', 'saveImageText', 'readImageText']);
    vi.mocked(sources.saveImage).mockReturnValue({ saved: true });
    vi.mocked(places.readImageText).mockResolvedValue({ read: 1, failed: 0 });
    vi.mocked(sources.getImage).mockReturnValue({ content_type: 'image/png', data: Buffer.from('x') });
    const c = new TravelSourcesController(sources, places);
    expect(c.list(user)).toEqual({ notes: 'list' });
    c.importManual(user, { title: 't', content: 'c', images: [] } as never);
    expect(sources.importManual).toHaveBeenCalled();
    c.importBatch(user, {} as never);
    c.extract(user, sourceId, { city: 'Torino' } as never);
    expect(places.extract).toHaveBeenCalledWith(7, sourceId, 'Torino', undefined);
    c.confirm(user, sourceId, 'p', { candidate_id: 'node:1' } as never);
    c.correctImageIdentity(user, sourceId, 'p', {} as never);
    c.saveImageText(user, sourceId, imageId, { engine: 'rapidocr', text: 'x' } as never);
    expect(places.saveImageText).toHaveBeenCalledWith(7, sourceId, imageId, 'rapidocr', 'x');
    expect(await c.saveImage(user, sourceId, imageId, Buffer.from([1]) as never)).toEqual({ saved: true, text_read: true });
    await expect(c.saveImage(user, sourceId, imageId, 'text' as never)).rejects.toThrow(BadRequestException);
    await c.readImages(user, sourceId);
    expect(places.readImageText).toHaveBeenLastCalledWith(7, sourceId);
    c.remove(user, sourceId);
    expect(sources.remove).toHaveBeenCalledWith(7, sourceId);
    const res = { setHeader: vi.fn(), send: vi.fn() };
    c.getImage(user, sourceId, imageId, res as never);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('profile', () => {
    const profiles = stub<TravelProfileService>(['view', 'save', 'forget', 'accept', 'dismiss', 'deleteSignal']);
    const c = new TravelProfileController(profiles);
    c.view(user);
    c.save(user, { likes: [] } as never);
    c.forget(user);
    c.accept(user, 'like:cafe');
    c.dismiss(user, 'like:cafe');
    c.deleteSignal(user, 3);
    expect(profiles.accept).toHaveBeenCalledWith(7, 'like:cafe');
    expect(profiles.deleteSignal).toHaveBeenCalledWith(7, 3);
    expect(profiles.forget).toHaveBeenCalledWith(7);
  });
});
