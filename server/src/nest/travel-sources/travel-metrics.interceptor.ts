import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { TravelMetricsService } from './travel-metrics.service';

/** The handlers worth counting, and what of their answer to keep. Reads never count. */
const TRACKED: Record<string, (body: unknown) => Record<string, unknown> | null> = {
  create: () => null,
  importManual: () => null,
  extract: (body) => ({ places: (body as { places?: unknown[] }).places?.length ?? 0, extractor: (body as { extractor?: string }).extractor ?? null }),
  generate: (body) => {
    const legs = (body as { plan?: { legs?: { status: string }[] } }).plan?.legs ?? [];
    return {
      verified: legs.filter((l) => l.status === 'verified').length,
      reference: legs.filter((l) => l.status === 'reference').length,
      unverified: legs.filter((l) => l.status === 'unverified').length,
    };
  },
  decide: () => null,
  weatherCheck: () => null,
  weatherApply: () => null,
  setHotel: () => null,
};

@Injectable()
export class TravelMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: TravelMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler().name;
    const pick = TRACKED[handler];
    const userId = context.switchToHttp().getRequest<Request>().user?.id;
    if (!pick || !userId) return next.handle();
    const kind = handler === 'create' ? 'plan_created' : handler.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const started = Date.now();
    const record = (ok: boolean, detail: Record<string, unknown> | null) => {
      try {
        this.metrics.record(userId, kind, ok, Date.now() - started, detail);
      } catch (err) {
        // Counting must never break the request it counts.
        console.warn(`[travel-metrics] not recorded: ${(err as Error).message}`);
      }
    };
    return next.handle().pipe(tap({ next: (body) => record(true, pick(body)), error: () => record(false, null) }));
  }
}
