import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  TravelPlaceKind,
  TravelPlanPace,
  TravelProfile,
  TravelProfileSuggestion,
  TravelProfileView,
  TravelSignalView,
} from '@trek/shared';
import { DatabaseService } from '../database/database.service';
import { KIND_LABELS, PACE_PER_DAY, type PoolPreferences } from './travel-pool';

/** How often a pattern must repeat before it is worth asking about. */
const SIGNAL_THRESHOLD = 3;
const PACE_LABELS: Record<TravelPlanPace, string> = { relaxed: '轻松', normal: '适中', packed: '紧凑' };

/** Places a day holds, read back as the pace that would have planned it. */
export function paceFor(placesPerDay: number): TravelPlanPace {
  if (placesPerDay <= (PACE_PER_DAY.relaxed + PACE_PER_DAY.normal) / 2) return 'relaxed';
  if (placesPerDay <= (PACE_PER_DAY.normal + PACE_PER_DAY.packed) / 2) return 'normal';
  return 'packed';
}

interface DecisionPayload {
  pool_key?: string;
  decision?: 'include' | 'exclude' | null;
  kind?: TravelPlaceKind;
  name?: string;
}

/**
 * Pure: what the decisions say. A kind dropped at least three times, and more often
 * dropped than kept, is offered as a dislike; kept at least three times as a like.
 */
export function suggestFromDecisions(decisions: DecisionPayload[], profile: TravelProfile | null): TravelProfileSuggestion[] {
  // A place toggled back and forth counts once, as it was left.
  const latest = new Map<string, DecisionPayload>();
  decisions.forEach((d, i) => latest.set(d.pool_key ?? `#${i}`, d));
  const counts = new Map<TravelPlaceKind, { include: number; exclude: number }>();
  for (const d of latest.values()) {
    if (!d.kind || !d.decision) continue;
    const entry = counts.get(d.kind) ?? { include: 0, exclude: 0 };
    entry[d.decision]++;
    counts.set(d.kind, entry);
  }
  const out: TravelProfileSuggestion[] = [];
  for (const [kind, { include, exclude }] of counts) {
    const label = KIND_LABELS[kind];
    if (exclude >= SIGNAL_THRESHOLD && exclude > include && !profile?.dislikes.includes(kind)) {
      out.push({ key: `dislike:${kind}`, text: `你好像不太喜欢${label}，要记下来吗？`, evidence: `在地点池里划掉过 ${exclude} 处${label}`, change: { dislikes: kind } });
    } else if (include >= SIGNAL_THRESHOLD && include > exclude && !profile?.likes.includes(kind)) {
      out.push({ key: `like:${kind}`, text: `你好像很喜欢${label}，要记下来吗？`, evidence: `在地点池里主动保留过 ${include} 处${label}`, change: { likes: kind } });
    }
  }
  return out;
}

/** Pure: the pace of the trips as they stand after the traveller's own edits. */
export function suggestPace(dayCounts: number[], profile: TravelProfile | null): TravelProfileSuggestion | null {
  const planned = dayCounts.filter((n) => n > 0);
  if (planned.length < SIGNAL_THRESHOLD) return null;
  const average = planned.reduce((sum, n) => sum + n, 0) / planned.length;
  const pace = paceFor(average);
  if (profile?.pace === pace) return null;
  return {
    key: `pace:${pace}`,
    text: `你的行程通常每天约 ${average.toFixed(1)} 处，要把节奏设为「${PACE_LABELS[pace]}」吗？`,
    evidence: `按你修改后的 ${planned.length} 天行程计算`,
    change: { pace },
  };
}

function summarise(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'pool_decision':
      return payload.decision === 'include' ? `保留了「${payload.name}」` : payload.decision === 'exclude' ? `划掉了「${payload.name}」` : `撤销了对「${payload.name}」的取舍`;
    case 'focus_changed':
      return `把侧重从 ${payload.from} 改为 ${payload.to}`;
    case 'plan_created':
      return `新建计划：${(payload.destinations as string[] | undefined)?.join('、') ?? ''}`;
    case 'trip_generated':
      return `生成了行程 #${payload.trip_id}`;
    default:
      return kind;
  }
}

/** The long-term traveller profile: explicit answers, accepted suggestions, and the signals behind them. */
@Injectable()
export class TravelProfileService {
  constructor(private readonly db: DatabaseService) {}

  profile(userId: number): TravelProfile | null {
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_profiles WHERE user_id = ?', userId);
    return row ? JSON.parse(row.payload) : null;
  }

  save(userId: number, profile: TravelProfile): TravelProfileView {
    this.db.run(
      'INSERT INTO travel_profiles (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      userId, JSON.stringify(profile), new Date().toISOString(),
    );
    return this.view(userId);
  }

  /** Pool keys of places on generated trips that have already ended. */
  visited(userId: number, today = new Date().toISOString().slice(0, 10)): Set<string> {
    return new Set(this.db.all<{ pool_key: string }>(
      'SELECT DISTINCT e.pool_key FROM travel_place_evidence e JOIN trips t ON t.id = e.trip_id WHERE e.user_id = ? AND t.end_date IS NOT NULL AND t.end_date < ?',
      userId, today,
    ).map((row) => row.pool_key));
  }

  preferences(userId: number): PoolPreferences & { walking: TravelProfile['walking'] } {
    const profile = this.profile(userId);
    return {
      likes: profile?.likes ?? [], dislikes: profile?.dislikes ?? [], avoid: profile?.avoid ?? [],
      walking: profile?.walking ?? 'medium', visited: this.visited(userId),
    };
  }

  private suggestions(userId: number, profile: TravelProfile | null): TravelProfileSuggestion[] {
    const decisions = this.db
      .all<{ payload: string }>("SELECT payload FROM travel_preference_signals WHERE user_id = ? AND kind = 'pool_decision' ORDER BY id", userId)
      .map((row) => JSON.parse(row.payload) as DecisionPayload);
    const dayCounts = this.db.all<{ n: number }>(
      'SELECT COUNT(a.id) AS n FROM days d JOIN trips t ON t.id = d.trip_id LEFT JOIN day_assignments a ON a.day_id = d.id ' +
        'WHERE d.trip_id IN (SELECT DISTINCT trip_id FROM travel_place_evidence WHERE user_id = ?) GROUP BY d.id',
      userId,
    ).map((row) => row.n);
    const dismissed = new Set(this.db.all<{ suggestion_key: string }>('SELECT suggestion_key FROM travel_profile_dismissed WHERE user_id = ?', userId).map((row) => row.suggestion_key));
    const pace = suggestPace(dayCounts, profile);
    return [...suggestFromDecisions(decisions, profile), ...(pace ? [pace] : [])].filter((s) => !dismissed.has(s.key));
  }

  view(userId: number): TravelProfileView {
    const profile = this.profile(userId);
    const row = this.db.get<{ updated_at: string }>('SELECT updated_at FROM travel_profiles WHERE user_id = ?', userId);
    const signals: TravelSignalView[] = this.db
      .all<{ id: number; plan_id: string; kind: string; payload: string; created_at: string }>(
        'SELECT id, plan_id, kind, payload, created_at FROM travel_preference_signals WHERE user_id = ? ORDER BY id DESC LIMIT 200', userId,
      )
      .map((s) => ({ id: s.id, plan_id: s.plan_id, kind: s.kind, summary: summarise(s.kind, JSON.parse(s.payload)), created_at: s.created_at }));
    return { profile, updated_at: row?.updated_at ?? null, suggestions: this.suggestions(userId, profile), signals, visited_count: this.visited(userId).size };
  }

  accept(userId: number, key: string): TravelProfileView {
    const profile = this.profile(userId);
    const suggestion = this.suggestions(userId, profile).find((s) => s.key === key);
    if (!suggestion) throw new NotFoundException('No such suggestion');
    if (!profile) throw new BadRequestException('Answer the profile questions first');
    const next: TravelProfile = { ...profile, likes: [...profile.likes], dislikes: [...profile.dislikes] };
    if ('likes' in suggestion.change) {
      next.likes.push(suggestion.change.likes);
      next.dislikes = next.dislikes.filter((kind) => kind !== (suggestion.change as { likes: TravelPlaceKind }).likes);
    } else if ('dislikes' in suggestion.change) {
      next.dislikes.push(suggestion.change.dislikes);
      next.likes = next.likes.filter((kind) => kind !== (suggestion.change as { dislikes: TravelPlaceKind }).dislikes);
    } else {
      next.pace = suggestion.change.pace;
    }
    return this.save(userId, next);
  }

  dismiss(userId: number, key: string): TravelProfileView {
    if (!/^(like|dislike|pace):[a-z]+$/.test(key)) throw new BadRequestException('Invalid suggestion');
    this.db.run('INSERT OR IGNORE INTO travel_profile_dismissed (user_id, suggestion_key) VALUES (?, ?)', userId, key);
    return this.view(userId);
  }

  deleteSignal(userId: number, id: number): TravelProfileView {
    const result = this.db.run('DELETE FROM travel_preference_signals WHERE user_id = ? AND id = ?', userId, id);
    if (!result.changes) throw new NotFoundException('Signal not found');
    return this.view(userId);
  }

  /** Forget everything: answers, signals and dismissed suggestions. Trips and plans stay. */
  forget(userId: number): TravelProfileView {
    this.db.transaction(() => {
      this.db.run('DELETE FROM travel_profiles WHERE user_id = ?', userId);
      this.db.run('DELETE FROM travel_preference_signals WHERE user_id = ?', userId);
      this.db.run('DELETE FROM travel_profile_dismissed WHERE user_id = ?', userId);
    });
    return this.view(userId);
  }
}
