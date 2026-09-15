/**
 * Live with actions ≡ replay(log) (plan §3.7, §6 T3).
 *
 *   bun test tests/sim/replay.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { Action, RoutingRule, SimEvent, SimState } from '../../src/sim/types';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG } from '../../src/sim/constants';
import {
  advanceTo,
  appendAction,
  appendCheckpoint,
  applyAction,
  createState,
  hashState,
  isCheckpointHour,
  newLog,
  replay,
  verifyCheckpoints,
} from '../../src/sim/events';
import { PRELUDE_HOURS } from '../../src/sim/time';

/** Bun's default per-test timeout is 5 s; a prelude alone is ~700 ticks. */
const SLOW = 60_000;

const WEEK = DEFAULT_CONFIG.constants.HOURS_PER_WEEK;

const trivialRule: RoutingRule = { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' };
const fixA: Action = { type: 'routing.set', rule: trivialRule };
const fixB: Action = { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { retry: { circuitBreaker: true, backoff: 'exponential' } } };

/** A seeded script: (hours after login, action) pairs over 8 weeks. */
function script(state: SimState): { at: number; action: Action }[] {
  const idle = state.world.bleeds.idle;
  return [
    { at: 5, action: { type: 'fleet.policy', fleetId: 'summarizer-east', patch: { status: 'paused' } } },
    { at: 30, action: { type: 'fleet.policy', fleetId: 'summarizer-east', patch: { status: 'active' } } },
    { at: WEEK + 3, action: fixA },
    { at: WEEK + 3, action: fixB },
    { at: 2 * WEEK, action: { type: 'fleet.policy', fleetId: idle[0], patch: { scaleToZero: true } } },
    { at: 3 * WEEK + 17, action: { type: 'routing.set', rule: { id: 'op-heavy', priority: 5, match: { sizeClass: 'heavy' }, tier: 'medium', author: 'operator' } } },
    { at: 4 * WEEK + 100, action: { type: 'routing.remove', ruleId: 'op-heavy' } },
    { at: 5 * WEEK, action: { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { concurrency: 400, retry: { maxAttempts: 2 } } } },
    { at: 6 * WEEK + 1, action: { type: 'routing.remove', ruleId: 'cf-summarizer-east' } },
    { at: 7 * WEEK + 50, action: { type: 'fleet.policy', fleetId: 'no-such-fleet', patch: { status: 'paused' } } },
  ];
}

/** Play the script live, appending checkpoints on every checkpoint hour. */
function playLive(seed: number): { state: SimState; log: SimEvent[] } {
  const rng = createRng(seed);
  let state = createState(seed);
  let log = newLog(seed, 1_000);
  const events = script(state);
  const end = PRELUDE_HOURS + 8 * WEEK;
  // Advance hour by hour so checkpoints land on their hours exactly as a controller would.
  for (let t = state.t; t < end; t++) {
    for (const ev of events) {
      if (PRELUDE_HOURS + ev.at === t) {
        log = appendAction(log, state, ev.action, 2_000 + t);
        state = applyAction(state, ev.action);
      }
    }
    if (isCheckpointHour(t)) log = appendCheckpoint(log, state);
    state = advanceTo(state, t + 1, DEFAULT_CONFIG, rng);
  }
  log = appendCheckpoint(log, state);
  return { state, log };
}

describe('replay', () => {
  const { state, log } = playLive(11);

  test('the log starts with run.start at login and carries every action with t and wallMs', () => {
    expect(log[0]).toEqual({ type: 'run.start', t: PRELUDE_HOURS, seed: 11, wallMs: 1_000, version: DEFAULT_CONFIG.constants.SIM_VERSION });
    const actions = log.filter((e) => e.type !== 'run.start' && e.type !== 'checkpoint');
    expect(actions.length).toBe(script(state).length);
    for (const a of actions) expect(a.t).toBeGreaterThanOrEqual(PRELUDE_HOURS);
  }, SLOW);

  test('live with actions deep-equals replay(log, t)', () => {
    const replayed = replay(log, state.t);
    expect(replayed.t).toBe(state.t);
    expect(replayed.cash).toBe(state.cash);
    expect(replayed.routing).toEqual(state.routing);
    expect(replayed.fleets).toEqual(state.fleets);
    expect(replayed).toEqual(state);
  }, SLOW);

  test('checkpoint hashes verify', () => {
    const checkpoints = log.filter((e) => e.type === 'checkpoint');
    expect(checkpoints.length).toBe(8);
    expect(verifyCheckpoints(log)).toEqual({ ok: true, firstMismatchT: null });
    expect(hashState(replay(log, state.t))).toBe(hashState(state));
  }, SLOW);

  test('a tampered checkpoint reports the first mismatch', () => {
    const tampered = log.map((e) => (e.type === 'checkpoint' && e.t === PRELUDE_HOURS + 3 * WEEK ? { ...e, hash: 'deadbeef' } : e));
    expect(verifyCheckpoints(tampered)).toEqual({ ok: false, firstMismatchT: PRELUDE_HOURS + 3 * WEEK });
  }, SLOW);

  test('replay to an earlier hour stops there and ignores later events', () => {
    const early = replay(log, PRELUDE_HOURS + 10);
    expect(early.t).toBe(PRELUDE_HOURS + 10);
    expect(early.fleets['summarizer-east'].policy.status).toBe('paused');
    expect(early.routing.some((r) => r.id === 'op-trivial')).toBe(false);
  }, SLOW);
});

describe('applyAction', () => {
  const login = createState(12);

  test('routing.set upserts by id and keeps rules sorted by (priority, id)', () => {
    const s1 = applyAction(login, fixA);
    expect(s1.routing[0].id).toBe('op-trivial');
    const s2 = applyAction(s1, { type: 'routing.set', rule: { ...trivialRule, tier: 'medium' } });
    expect(s2.routing.filter((r) => r.id === 'op-trivial').length).toBe(1);
    expect(s2.routing[0].tier).toBe('medium');
    const s3 = applyAction(s2, { type: 'routing.set', rule: { id: 'aa', priority: 1, match: {}, tier: 'small', author: 'operator' } });
    expect(s3.routing.map((r) => r.id).slice(0, 2)).toEqual(['aa', 'op-trivial']);
  }, SLOW);

  test('routing.remove of an unknown rule and fleet.policy of an unknown fleet leave the state object unchanged', () => {
    expect(applyAction(login, { type: 'routing.remove', ruleId: 'nope' })).toBe(login);
    expect(applyAction(login, { type: 'fleet.policy', fleetId: 'nope', patch: { status: 'paused' } })).toBe(login);
  }, SLOW);

  test('fleet.policy deep-merges and clamps concurrency ≥ 0 and maxAttempts to 1..5', () => {
    const s = applyAction(login, { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { concurrency: -10, retry: { maxAttempts: 9 } } });
    const p = s.fleets['halberd-monitor'].policy;
    expect(p.concurrency).toBe(0);
    expect(p.retry.maxAttempts).toBe(5);
    expect(p.retry.backoff).toBe('none');
    expect(p.retry.circuitBreaker).toBe(false);
    const s2 = applyAction(s, { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { retry: { maxAttempts: 0 } } });
    expect(s2.fleets['halberd-monitor'].policy.retry.maxAttempts).toBe(1);
    expect(s2.fleets['halberd-monitor'].policy.concurrency).toBe(0);
    expect(login.fleets['halberd-monitor'].policy.retry.maxAttempts).toBe(5); // input untouched
  }, SLOW);
});
