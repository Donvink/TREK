import Database from 'better-sqlite3';
import { travelProfileSchema, type TravelProfile } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { paceFor, suggestFromDecisions, suggestPace, TravelProfileService } from '../../../src/nest/travel-sources/travel-profile.service';

vi.mock('../../../src/db/database', () => ({}));

const base: TravelProfile = { likes: ['cafe'], dislikes: [], pace: 'normal', walking: 'medium', avoid: ['排长队'] };
const decision = (pool_key: string, kind: string, d: 'include' | 'exclude' | null, name = pool_key) => ({ pool_key, kind, decision: d, name });

describe('traveller profile inference', () => {
  it('validates answers and refuses a kind both liked and disliked', () => {
    expect(travelProfileSchema.safeParse(base).success).toBe(true);
    expect(travelProfileSchema.safeParse({ ...base, dislikes: ['cafe'] }).success).toBe(false);
    expect(travelProfileSchema.safeParse({ ...base, avoid: [''] }).success).toBe(false);
  });

  it('offers a dislike after three drops, a like after three keeps, counting a toggled place once', () => {
    const museums = [decision('m1', 'museum', 'exclude'), decision('m2', 'museum', 'exclude'), decision('m3', 'museum', 'exclude')];
    const toggled = [decision('b1', 'bar', 'include'), decision('b1', 'bar', null), decision('b1', 'bar', 'include'), decision('b2', 'bar', 'include')];
    const out = suggestFromDecisions([...museums, ...toggled, decision('n1', 'nature', 'include'), decision('n2', 'nature', 'include'), decision('n3', 'nature', 'include')], base);
    expect(out.map((s) => s.key).sort()).toEqual(['dislike:museum', 'like:nature']);
    expect(out.find((s) => s.key === 'dislike:museum')?.evidence).toBe('在地点池里划掉过 3 处博物馆');
    // Already in the profile: nothing to ask.
    expect(suggestFromDecisions([decision('c1', 'cafe', 'include'), decision('c2', 'cafe', 'include'), decision('c3', 'cafe', 'include')], base)).toEqual([]);
  });

  it('reads the pace back from edited trips once there are enough days', () => {
    expect(paceFor(2)).toBe('relaxed');
    expect(paceFor(4)).toBe('normal');
    expect(paceFor(6)).toBe('packed');
    expect(suggestPace([2, 2, 0], base)).toBeNull();
    expect(suggestPace([2, 3, 2], base)).toMatchObject({ key: 'pace:relaxed', change: { pace: 'relaxed' } });
    expect(suggestPace([4, 4, 4], base)).toBeNull();
  });
});

describe('TravelProfileService', () => {
  let database: Database.Database;
  let service: TravelProfileService;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE trips (id INTEGER PRIMARY KEY, end_date TEXT);
      CREATE TABLE days (id INTEGER PRIMARY KEY, trip_id INTEGER);
      CREATE TABLE day_assignments (id INTEGER PRIMARY KEY, day_id INTEGER);
      CREATE TABLE travel_place_evidence (trip_id INTEGER, place_id INTEGER, user_id INTEGER, plan_id TEXT, pool_key TEXT, payload TEXT);
      CREATE TABLE travel_preference_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, plan_id TEXT, kind TEXT, payload TEXT, created_at TEXT);
      CREATE TABLE travel_profiles (user_id INTEGER PRIMARY KEY, payload TEXT, updated_at TEXT);
      CREATE TABLE travel_profile_dismissed (user_id INTEGER, suggestion_key TEXT, PRIMARY KEY(user_id, suggestion_key));
    `);
    service = new TravelProfileService(new DatabaseService(database));
    const signal = (kind: string, payload: object) => database.prepare('INSERT INTO travel_preference_signals (user_id, plan_id, kind, payload, created_at) VALUES (1, ?, ?, ?, ?)').run('p', kind, JSON.stringify(payload), 'now');
    for (const key of ['m1', 'm2', 'm3']) signal('pool_decision', decision(key, 'museum', 'exclude', `馆${key}`));
    signal('focus_changed', { from: 'mixed', to: 'food' });
    // Two past trips of three days each, edited down to two places a day; one trip still to come.
    database.exec(`
      INSERT INTO trips VALUES (1, '2026-09-12'), (2, '2026-10-01'), (3, '2099-01-01');
      INSERT INTO days (id, trip_id) VALUES (1, 1), (2, 1), (3, 2), (4, 2);
      INSERT INTO day_assignments (day_id) VALUES (1), (1), (2), (2), (3), (3), (4), (4);
      INSERT INTO travel_place_evidence VALUES (1, 10, 1, 'p', 'k-old', '{}'), (2, 11, 1, 'p', 'k-old2', '{}'), (3, 12, 1, 'p', 'k-future', '{}');
    `);
  });
  afterEach(() => database.close());

  it('shows answers, suggestions, readable signals and trips taken', () => {
    const view = service.view(1);
    expect(view.profile).toBeNull();
    expect(view.suggestions.map((s) => s.key).sort()).toEqual(['dislike:museum', 'pace:relaxed']);
    expect(view.signals[0].summary).toBe('把侧重从 mixed 改为 food');
    expect(view.signals[1].summary).toBe('划掉了「馆m3」');
    expect(view.visited_count).toBe(2);
    expect(service.preferences(1)).toMatchObject({ likes: [], walking: 'medium' });
    expect([...service.preferences(1).visited].sort()).toEqual(['k-old', 'k-old2']);
  });

  it('writes a suggestion only when accepted, forgets dismissed ones, and erases everything on request', () => {
    expect(() => service.accept(1, 'dislike:museum')).toThrow('Answer the profile questions first');
    service.save(1, { ...base, likes: ['museum'] });
    const accepted = service.accept(1, 'dislike:museum');
    expect(accepted.profile).toMatchObject({ dislikes: ['museum'], likes: [] });
    expect(service.accept(1, 'pace:relaxed').profile?.pace).toBe('relaxed');
    expect(() => service.accept(1, 'pace:relaxed')).toThrow('No such suggestion');

    service.save(1, base);
    expect(service.dismiss(1, 'dislike:museum').suggestions.map((s) => s.key)).not.toContain('dislike:museum');
    expect(() => service.dismiss(1, 'drop table')).toThrow('Invalid suggestion');

    const first = service.view(1).signals[0].id;
    expect(service.deleteSignal(1, first).signals.some((s) => s.id === first)).toBe(false);
    expect(() => service.deleteSignal(2, first)).toThrow('Signal not found');

    const empty = service.forget(1);
    expect(empty).toMatchObject({ profile: null, signals: [] });
    expect(empty.suggestions.map((s) => s.key)).toEqual(['pace:relaxed']);
  });
});
