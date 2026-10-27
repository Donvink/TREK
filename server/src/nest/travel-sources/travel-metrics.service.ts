import { Injectable } from '@nestjs/common';
import type { TravelMetrics } from '@trek/shared';
import { DatabaseService } from '../database/database.service';

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** What people do with guide planning, for the validation phase. Counts only; no note text or place names. */
@Injectable()
export class TravelMetricsService {
  constructor(private readonly db: DatabaseService) {}

  record(userId: number, kind: string, ok: boolean, durationMs: number, detail: Record<string, unknown> | null) {
    this.db.run(
      'INSERT INTO travel_events (user_id, kind, ok, duration_ms, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId, kind, ok ? 1 : 0, Math.round(durationMs), detail ? JSON.stringify(detail) : null, new Date().toISOString(),
    );
  }

  answerPriceTest(userId: number, planId: string, choice: 'would_pay' | 'would_not_pay') {
    this.db.run(
      'INSERT INTO travel_price_answers (user_id, plan_id, choice, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, plan_id) DO NOTHING',
      userId, planId, choice, new Date().toISOString(),
    );
  }

  /** The price question comes from the third generated plan on, once per plan. */
  priceTestDue(userId: number, planId: string, generatedPlans: number): boolean {
    if (generatedPlans < 2) return false;
    return !this.db.get('SELECT 1 AS answered FROM travel_price_answers WHERE user_id = ? AND plan_id = ?', userId, planId);
  }

  summary(): TravelMetrics {
    const plans = this.db.all<{ payload: string }>('SELECT payload FROM travel_plans').map((r) => JSON.parse(r.payload) as { created_at: string; generated_at: string | null });
    const events = this.db.all<{ kind: string; count: number; failed: number; avg_ms: number }>(
      'SELECT kind, COUNT(*) AS count, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed, ROUND(AVG(duration_ms)) AS avg_ms FROM travel_events GROUP BY kind ORDER BY kind',
    );
    const details = (kind: string) => this.db
      .all<{ detail: string | null }>('SELECT detail FROM travel_events WHERE kind = ? AND ok = 1', kind)
      .map((r) => (r.detail ? JSON.parse(r.detail) : {}) as Record<string, number>);
    const extractions = details('extract').map((d) => d.places).filter((n): n is number => typeof n === 'number');
    const legs = { verified: 0, reference: 0, unverified: 0 };
    for (const d of details('generate')) for (const key of Object.keys(legs) as (keyof typeof legs)[]) legs[key] += d[key] ?? 0;
    const answers = this.db.all<{ choice: 'would_pay' | 'would_not_pay'; n: number }>('SELECT choice, COUNT(*) AS n FROM travel_price_answers GROUP BY choice');
    return {
      users: this.db.get<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM travel_events')?.n ?? 0,
      plans: plans.length,
      generated_plans: plans.filter((p) => p.generated_at).length,
      events,
      median_minutes_to_trip: median(plans.filter((p) => p.generated_at).map((p) => (Date.parse(p.generated_at!) - Date.parse(p.created_at)) / 60_000)),
      places_per_extraction: extractions.length ? Math.round((extractions.reduce((a, b) => a + b, 0) / extractions.length) * 10) / 10 : null,
      legs,
      price_test: { would_pay: answers.find((a) => a.choice === 'would_pay')?.n ?? 0, would_not_pay: answers.find((a) => a.choice === 'would_not_pay')?.n ?? 0 },
    };
  }
}
