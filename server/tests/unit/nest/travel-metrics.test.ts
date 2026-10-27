import Database from 'better-sqlite3';
import { of, throwError, lastValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { TravelMetricsInterceptor } from '../../../src/nest/travel-sources/travel-metrics.interceptor';
import { median, TravelMetricsService } from '../../../src/nest/travel-sources/travel-metrics.service';

vi.mock('../../../src/db/database', () => ({}));

const context = (handler: string, userId: number | undefined) => ({
  getHandler: () => ({ name: handler }),
  switchToHttp: () => ({ getRequest: () => ({ user: userId ? { id: userId } : undefined }) }),
}) as unknown as ExecutionContext;
const handle = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('guide planning metrics', () => {
  let database: Database.Database;
  let metrics: TravelMetricsService;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE travel_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, ok INTEGER, duration_ms INTEGER, detail TEXT, created_at TEXT);
      CREATE TABLE travel_price_answers (user_id INTEGER, plan_id TEXT, choice TEXT, created_at TEXT, PRIMARY KEY(user_id, plan_id));
      CREATE TABLE travel_plans (user_id INTEGER, plan_id TEXT, payload TEXT, updated_at TEXT);
    `);
    metrics = new TravelMetricsService(new DatabaseService(database));
  });
  afterEach(() => database.close());

  it('counts tracked mutations with their outcome and leaves reads and anonymous calls alone', async () => {
    const interceptor = new TravelMetricsInterceptor(metrics);
    await lastValueFrom(interceptor.intercept(context('extract', 1), handle({ places: [1, 2, 3], extractor: 'llm' })));
    await lastValueFrom(interceptor.intercept(context('generate', 2), handle({ plan: { legs: [{ status: 'verified' }, { status: 'reference' }, { status: 'verified' }] } })));
    await lastValueFrom(interceptor.intercept(context('importManual', 1), handle({})));
    await lastValueFrom(interceptor.intercept(context('detail', 1), handle({})));
    await lastValueFrom(interceptor.intercept(context('extract', undefined), handle({})));
    await expect(lastValueFrom(interceptor.intercept(context('setHotel', 1), { handle: () => throwError(() => new Error('not found')) }))).rejects.toThrow('not found');

    const kinds = database.prepare('SELECT kind, ok, detail FROM travel_events ORDER BY id').all();
    expect(kinds).toEqual([
      { kind: 'extract', ok: 1, detail: '{"places":3,"extractor":"llm"}' },
      { kind: 'generate', ok: 1, detail: '{"verified":2,"reference":1,"unverified":0}' },
      { kind: 'import_manual', ok: 1, detail: null },
      { kind: 'set_hotel', ok: 0, detail: null },
    ]);
  });

  it('never fails a request because counting failed', async () => {
    database.exec('DROP TABLE travel_events');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lastValueFrom(new TravelMetricsInterceptor(metrics).intercept(context('extract', 1), handle({ places: [] })))).resolves.toEqual({ places: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('asks the price question from the third generated plan, once per plan, and sums it all up', () => {
    expect(metrics.priceTestDue(1, 'p3', 1)).toBe(false);
    expect(metrics.priceTestDue(1, 'p3', 2)).toBe(true);
    metrics.answerPriceTest(1, 'p3', 'would_pay');
    metrics.answerPriceTest(1, 'p3', 'would_not_pay');
    expect(metrics.priceTestDue(1, 'p3', 2)).toBe(false);
    metrics.answerPriceTest(2, 'p9', 'would_not_pay');

    metrics.record(1, 'extract', true, 4000, { places: 4 });
    metrics.record(2, 'extract', true, 6000, { places: 2 });
    metrics.record(2, 'extract', false, 100, null);
    metrics.record(1, 'generate', true, 3000, { verified: 2, reference: 1, unverified: 1 });
    const insert = database.prepare('INSERT INTO travel_plans VALUES (?, ?, ?, ?)');
    insert.run(1, 'a', JSON.stringify({ created_at: '2026-10-27T10:00:00Z', generated_at: '2026-10-27T10:10:00Z' }), '');
    insert.run(2, 'b', JSON.stringify({ created_at: '2026-10-27T10:00:00Z', generated_at: '2026-10-27T10:30:00Z' }), '');
    insert.run(2, 'c', JSON.stringify({ created_at: '2026-10-27T10:00:00Z', generated_at: null }), '');

    expect(metrics.summary()).toEqual({
      users: 2, plans: 3, generated_plans: 2,
      events: [{ kind: 'extract', count: 3, failed: 1, avg_ms: 3367 }, { kind: 'generate', count: 1, failed: 0, avg_ms: 3000 }],
      median_minutes_to_trip: 20, places_per_extraction: 3,
      legs: { verified: 2, reference: 1, unverified: 1 },
      price_test: { would_pay: 1, would_not_pay: 1 },
    });
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
  });
});
