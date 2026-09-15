/**
 * The economy contract (plan §3.6, §6 T3). Tests pin outcomes, never constants.
 *
 *   bun test tests/sim/economy.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { Action, SimState } from '../../src/sim/types';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG, configWithBleeds } from '../../src/sim/constants';
import { applyAction, createState } from '../../src/sim/events';
import { step } from '../../src/sim/step';
import { PRELUDE_HOURS } from '../../src/sim/time';
import { slopePerWeek } from '../../src/sim/metrics';

const c = DEFAULT_CONFIG.constants;
const WEEK = c.HOURS_PER_WEEK;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const fixA: Action = { type: 'routing.set', rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' } };
const fixB: Action = { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { retry: { circuitBreaker: true, backoff: 'exponential' } } };
const fixC = (s: SimState): Action[] => s.world.bleeds.idle.map((id) => ({ type: 'fleet.policy', fleetId: id, patch: { scaleToZero: true } }));
const pause = (fleetId: string): Action => ({ type: 'fleet.policy', fleetId, patch: { status: 'paused' } });

const logins = new Map<number, SimState>();
const login = (seed: number): SimState => {
  let s = logins.get(seed);
  if (!s) {
    s = createState(seed);
    logins.set(seed, s);
  }
  return s;
};

const apply = (s: SimState, actions: Action[]): SimState => actions.reduce((x, a) => applyAction(x, a), s);
const after = (seed: number, actions: Action[], weeks: number): SimState => step(apply(login(seed), actions), weeks * WEEK, DEFAULT_CONFIG, createRng(seed));
/** Slope after `weeks` with `actions` applied at login; memoised because the pause ordering reuses the fixes. */
const slopes = new Map<string, number>();
const slopeAfter = (seed: number, actions: Action[], weeks: number): number => {
  const key = `${seed}|${weeks}|${JSON.stringify(actions)}`;
  let v = slopes.get(key);
  if (v === undefined) {
    v = slopePerWeek(after(seed, actions, weeks));
    slopes.set(key, v);
  }
  return v;
};
/** Bun's default per-test timeout is 5 s; these loops run tens of thousands of ticks. */
const SLOW = 60_000;

describe('untouched', () => {
  test('opening slope ∈ [−6.5M, −5.0M]/wk for seeds 1..10', () => {
    for (const seed of SEEDS) {
      const slope = slopePerWeek(login(seed));
      expect(slope).toBeGreaterThanOrEqual(-6.5e6);
      expect(slope).toBeLessThanOrEqual(-5.0e6);
    }
  }, SLOW);

  test('login state: full ring, 28 days, cash = OPENING_CASH and higher at the start of the prelude', () => {
    const s = login(1);
    expect(s.t).toBe(PRELUDE_HOURS);
    expect(s.hourly.length).toBe(c.HOURLY_WINDOW);
    expect(s.daily.length).toBe(28);
    expect(s.dayAcc).toBeNull();
    expect(s.cash).toBe(c.OPENING_CASH);
    expect(s.hourly[0].cashClose).toBeGreaterThan(c.OPENING_CASH);
    expect(s.hourly[s.hourly.length - 1].cashClose).toBe(c.OPENING_CASH);
    expect(s.daily[s.daily.length - 1].cashClose).toBe(c.OPENING_CASH);
    expect(s.status).toBe('running');
  }, SLOW);

  test('bankruptcy lands in [23, 30] weeks from login for seeds 1..10', () => {
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      let s = login(seed);
      for (let w = 0; w < 40 && s.status === 'running'; w++) s = step(s, WEEK, DEFAULT_CONFIG, rng);
      expect(s.status).toBe('bankrupt');
      expect(s.cash).toBe(0);
      const weeks = ((s.bankruptAt as number) - PRELUDE_HOURS) / WEEK;
      expect(weeks).toBeGreaterThanOrEqual(23);
      expect(weeks).toBeLessThanOrEqual(30);
      // Further steps are no-ops.
      expect(step(s, WEEK, DEFAULT_CONFIG, rng)).toBe(s);
    }
  }, SLOW);
});

describe('the levers', () => {
  test('fix (a) at login → after 2 weeks |slope| < 0.6 × |slope₀|', () => {
    for (const seed of SEEDS) {
      const slope0 = slopePerWeek(login(seed));
      expect(Math.abs(slopeAfter(seed, [fixA], 2))).toBeLessThan(0.6 * Math.abs(slope0));
    }
  }, SLOW);

  test('fix all three at login → slope > 0 after 4 weeks and cash(wk 8) > cash(wk 4)', () => {
    for (const seed of SEEDS) {
      const s0 = login(seed);
      const rng = createRng(seed);
      const s4 = step(apply(s0, [fixA, fixB, ...fixC(s0)]), 4 * WEEK, DEFAULT_CONFIG, rng);
      expect(slopePerWeek(s4)).toBeGreaterThan(0);
      const s8 = step(s4, 4 * WEEK, DEFAULT_CONFIG, rng);
      expect(s8.cash).toBeGreaterThan(s4.cash);
    }
  }, SLOW);

  test('fix all three at week 16 → never bankrupt through week 52', () => {
    for (const seed of [1, 2]) {
      const rng = createRng(seed);
      let s = step(login(seed), 16 * WEEK, DEFAULT_CONFIG, rng);
      expect(s.status).toBe('running');
      s = step(apply(s, [fixA, fixB, ...fixC(s)]), 36 * WEEK, DEFAULT_CONFIG, rng);
      expect(s.status).toBe('running');
      expect(s.t).toBe(PRELUDE_HOURS + 52 * WEEK);
    }
  }, SLOW);

  test('bleeds: all false → slope > 0 at login', () => {
    for (const seed of [1, 2, 3]) {
      const clean = createState(seed, configWithBleeds({ tiering: false, retryStorm: false, idle: false }));
      expect(clean.world.routing.length).toBe(0);
      expect(slopePerWeek(clean)).toBeGreaterThan(0);
    }
  }, SLOW);
});

describe('pause is priced (slopes after 2 weeks, seeds 1..10)', () => {
  test('pausing summarizer-east alone is worse than fix (a)', () => {
    for (const seed of SEEDS) expect(slopeAfter(seed, [pause('summarizer-east')], 2)).toBeLessThan(slopeAfter(seed, [fixA], 2));
  }, SLOW);

  test('pausing halberd-monitor alone is worse than fix (b)', () => {
    for (const seed of SEEDS) expect(slopeAfter(seed, [pause('halberd-monitor')], 2)).toBeLessThan(slopeAfter(seed, [fixB], 2));
  }, SLOW);

  test('pausing both is worse than fix (a) + (b)', () => {
    for (const seed of SEEDS) {
      expect(slopeAfter(seed, [pause('summarizer-east'), pause('halberd-monitor')], 2)).toBeLessThan(slopeAfter(seed, [fixA, fixB], 2));
    }
  }, SLOW);

  test('pausing every fleet still bleeds (revenue 0, burn = opex)', () => {
    for (const seed of [1, 2, 3]) {
      const s0 = login(seed);
      const s = after(seed, s0.world.fleetOrder.map(pause), 2);
      const slope = slopePerWeek(s);
      expect(slope).toBeLessThan(0);
      const last = s.hourly[s.hourly.length - 1];
      expect(last.revenue).toBe(0);
      expect(last.tokenCost).toBe(0);
      expect(last.capacityCost).toBe(0);
    }
  }, SLOW);
});
