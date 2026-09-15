/**
 * RunController contract (plan §4.2, §4.6, §7 T5 acceptance).
 *
 *   bun test tests/console/run.test.ts
 *
 * Drives the controller headlessly with a Map-backed Storage and an
 * injected wall clock. Nothing here imports a `.svelte` or `.svelte.ts` file.
 */
import { describe, expect, test } from 'bun:test';
import { PAYOFF_MIN_HOURS, RunController, type Payoff } from '../../src/console/core/run';
import { SAVE_KEY, load, save } from '../../src/console/persistence';
import type { Action, SimEvent } from '../../src/sim/types';
import { CONSTANTS } from '../../src/sim/constants';
import { replay, verifyCheckpoints } from '../../src/sim/events';
import { MAX_CATCHUP_HOURS, PRELUDE_HOURS } from '../../src/sim/time';

/** Bun's default per-test timeout is 5 s; each run is a prelude plus weeks of ticks. */
const SLOW = 60_000;

const WEEK = CONSTANTS.HOURS_PER_WEEK;
const REAL_DAY_MS = 86_400_000;
const REAL_HOUR_MS = 3_600_000;
const T0 = 1_700_000_000_000;

class MemStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  [name: string]: unknown;
}

const fixA: Action = {
  type: 'routing.set',
  rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' },
};
const fixB: Action = {
  type: 'fleet.policy',
  fleetId: 'halberd-monitor',
  patch: { retry: { circuitBreaker: true, backoff: 'exponential' } },
};
function fixC(run: RunController): Action[] {
  return run.state.world.bleeds.idle.map((id) => ({ type: 'fleet.policy', fleetId: id, patch: { scaleToZero: true } }));
}

/** A controller over a fresh MemStorage with a settable clock. */
function harness(storage = new MemStorage()) {
  const clock = { now: T0 };
  const run = new RunController({ storage, now: () => clock.now });
  return { run, storage, clock };
}

describe('newRun / advance / dispatch / replay', () => {
  test('newRun(1) → advance(168) → dispatch(fixA) → replay(log) deep-equals state', () => {
    const { run } = harness();
    run.newRun(1);
    expect(run.seed).toBe(1);
    expect(run.state.t).toBe(PRELUDE_HOURS);
    expect(run.isFirstLogin).toBe(false);
    expect(run.log).toEqual([{ type: 'run.start', t: PRELUDE_HOURS, seed: 1, wallMs: T0, version: CONSTANTS.SIM_VERSION }]);

    const report = run.advance(WEEK);
    expect(report.hours).toBe(WEEK);
    expect(report.cashDelta).toBeLessThan(0);
    expect(report.slopeBefore).toBeLessThan(0);
    expect(run.lastAdvance).toBe(report);
    expect(run.state.t).toBe(PRELUDE_HOURS + WEEK);
    expect(run.time.t).toBe(run.state.t);

    run.dispatch(fixA);
    expect(run.state.routing.some((r) => r.id === 'op-trivial')).toBe(true);

    // A checkpoint landed on the week boundary, before the action dispatched there.
    const kinds = run.log.map((e) => e.type);
    expect(kinds).toEqual(['run.start', 'checkpoint', 'routing.set']);
    expect(run.log[1]).toMatchObject({ type: 'checkpoint', t: PRELUDE_HOURS + WEEK });
    expect(run.log[2]).toMatchObject({ type: 'routing.set', t: PRELUDE_HOURS + WEEK, wallMs: T0 });

    const replayed = replay(run.log, run.state.t);
    expect(replayed).toEqual(run.state);
    expect(verifyCheckpoints(run.log)).toEqual({ ok: true, firstMismatchT: null });
  }, SLOW);

  test('checkpoints land on every multiple of CHECKPOINT_EVERY_HOURS crossed, exactly once', () => {
    const { run } = harness();
    run.newRun(2);
    run.advance(10);
    run.advance(WEEK); // crosses PRELUDE + 168
    run.advance(WEEK - 10); // ends exactly on PRELUDE + 336
    run.advance(0);
    run.advance(1); // must not re-append the checkpoint at 336
    run.advance(3 * WEEK); // crosses 504, 672, 840
    const checkpoints = run.log.filter((e): e is Extract<SimEvent, { type: 'checkpoint' }> => e.type === 'checkpoint');
    expect(checkpoints.map((c) => c.t)).toEqual([1, 2, 3, 4, 5].map((k) => PRELUDE_HOURS + k * WEEK));
    expect(verifyCheckpoints(run.log).ok).toBe(true);
    expect(replay(run.log, run.state.t)).toEqual(run.state);
  }, SLOW);

  test('advance rejects a fractional or negative hour count', () => {
    const { run } = harness();
    run.newRun(1);
    expect(() => run.advance(1.5)).toThrow(RangeError);
    expect(() => run.advance(-1)).toThrow(RangeError);
    expect(run.state.t).toBe(PRELUDE_HOURS);
  }, SLOW);

  test('selectors are memoised on state identity and refreshed on change', () => {
    const { run } = harness();
    run.newRun(1);
    const fleets = run.fleets();
    expect(run.fleets()).toBe(fleets);
    expect(run.explore({ range: '7d', groupBy: 'fleet' })).toBe(run.explore({ range: '7d', groupBy: 'fleet' }));
    expect(run.fleet('summarizer-east')).toBe(run.fleet('summarizer-east'));
    expect(run.fleet('no-such-fleet')).toBeNull();
    expect(run.paletteFleets().length).toBe(run.state.world.fleetOrder.length);
    expect(run.paletteFleets().find((f) => f.id === 'halberd-monitor')?.name).toBe('halberd-monitor');
    expect(run.incidents().some((i) => i.kind === 'retry-storm' && i.fleetId === 'halberd-monitor')).toBe(true);
    expect(run.headline().length).toBe(4);
    expect(run.routing().rows.some((r) => r.rule.id === 'cf-summarizer-east')).toBe(true);
    expect(run.projectedZero()).not.toBeNull();
    expect(run.runwayMonths()).toBeGreaterThan(4);
    expect(run.runwayWeeks()).toBeGreaterThan(20);
    run.advance(1);
    expect(run.fleets()).not.toBe(fleets);
  }, SLOW);

  test('dispatch pauses a fleet, stamps the log, and saves at once', () => {
    const { run, storage } = harness();
    run.newRun(1);
    run.advance(3);
    run.dispatch({ type: 'fleet.policy', fleetId: 'summarizer-east', patch: { status: 'paused' } });
    expect(run.state.fleets['summarizer-east'].policy.status).toBe('paused');
    const rec = load(storage);
    expect(rec).not.toBeNull();
    expect(rec!.log.at(-1)).toMatchObject({ type: 'fleet.policy', fleetId: 'summarizer-east', t: PRELUDE_HOURS + 3 });
    expect(rec!.time.t).toBe(PRELUDE_HOURS + 3);
  }, SLOW);

  test('selectors throw before boot; the controller reports it', () => {
    const { run } = harness();
    expect(run.booted).toBe(false);
    expect(() => run.fleets()).toThrow();
    expect(() => run.advance(1)).toThrow();
  });
});

describe('boot', () => {
  test('an empty storage creates a run and marks the first login', () => {
    const { run, storage } = harness();
    run.boot();
    expect(run.isFirstLogin).toBe(true);
    expect(run.state.t).toBe(PRELUDE_HOURS);
    expect(run.state.cash).toBe(CONSTANTS.OPENING_CASH);
    expect(run.awaySummary).toBeNull();
    expect(run.payoff).toBeNull();
    expect(run.time).toEqual({ t: PRELUDE_HOURS, stampMs: T0, paused: false, speed: 1, carryMs: 0 });
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(load(storage)?.seed).toBe(run.seed);
  }, SLOW);

  test('a saved record with a 24 h-old stamp at speed 1 advances 168 and sets awaySummary', () => {
    const a = harness();
    a.run.newRun(1);
    a.run.saveNow();

    const b = harness(a.storage);
    b.clock.now = T0 + REAL_DAY_MS;
    b.run.boot();
    expect(b.run.isFirstLogin).toBe(false);
    expect(b.run.seed).toBe(1);
    expect(b.run.state.t).toBe(PRELUDE_HOURS + WEEK);
    expect(b.run.awaySummary).not.toBeNull();
    expect(b.run.awaySummary!.hours).toBe(WEEK);
    expect(b.run.awaySummary!.cashDelta).toBeLessThan(0);
    expect(b.run.time.stampMs).toBe(T0 + REAL_DAY_MS);
    expect(b.run.time.carryMs).toBe(0);
    expect(b.run.time.t).toBe(PRELUDE_HOURS + WEEK);
    expect(b.run.payoff).toBeNull();
    // The catch-up is a real advance: it reports, checkpoints, and replays.
    expect(b.run.lastAdvance?.hours).toBe(WEEK);
    expect(b.run.log.some((e) => e.type === 'checkpoint' && e.t === PRELUDE_HOURS + WEEK)).toBe(true);
    expect(replay(b.run.log, b.run.state.t)).toEqual(b.run.state);
  }, SLOW);

  test('a paused record does not advance', () => {
    const a = harness();
    a.run.newRun(1);
    a.run.pause();

    const b = harness(a.storage);
    b.clock.now = T0 + REAL_DAY_MS;
    b.run.boot();
    expect(b.run.isFirstLogin).toBe(false);
    expect(b.run.state.t).toBe(PRELUDE_HOURS);
    expect(b.run.time.paused).toBe(true);
    expect(b.run.awaySummary).toBeNull();
  }, SLOW);

  test('a saved run with actions restores to the same state', () => {
    const a = harness();
    a.run.newRun(3);
    a.run.advance(100);
    a.run.dispatch(fixA);
    a.run.advance(200);
    a.run.saveNow();

    const b = harness(a.storage);
    b.run.boot();
    expect(b.run.state).toEqual(a.run.state);
    expect(b.run.log).toEqual(a.run.log);
    expect(b.run.awaySummary).toBeNull();
    expect(b.run.checkpointMismatchT).toBeNull();
  }, SLOW);

  test('a version mismatch starts a new run', () => {
    const a = harness();
    a.run.newRun(1);
    const rec = load(a.storage)!;
    save({ ...rec, version: rec.version + 1 }, a.storage);

    const b = harness(a.storage);
    b.run.boot();
    expect(b.run.isFirstLogin).toBe(true);
    expect(b.run.state.t).toBe(PRELUDE_HOURS);
    expect(load(a.storage)?.version).toBe(CONSTANTS.SIM_VERSION);
  }, SLOW);

  test('a corrupt save starts a new run', () => {
    const storage = new MemStorage();
    storage.setItem(SAVE_KEY, '{oops');
    const { run } = harness(storage);
    run.boot();
    expect(run.isFirstLogin).toBe(true);
    expect(load(storage)).not.toBeNull();
  }, SLOW);

  test('a tampered checkpoint is reported and replay is trusted', () => {
    const a = harness();
    a.run.newRun(1);
    a.run.advance(WEEK);
    a.run.saveNow();
    const rec = load(a.storage)!;
    rec.log = rec.log.map((e) => (e.type === 'checkpoint' ? { ...e, hash: 'deadbeef' } : e));
    save(rec, a.storage);

    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const b = harness(a.storage);
      b.run.boot();
      expect(b.run.checkpointMismatchT).toBe(PRELUDE_HOURS + WEEK);
      expect(b.run.state).toEqual(a.run.state);
      expect(warnings.length).toBe(1);
    } finally {
      console.warn = warn;
    }
  }, SLOW);
});

describe('tick and the wall clock', () => {
  test('tick advances the whole hours owed and carries the remainder', () => {
    const { run, clock } = harness();
    run.newRun(1);
    const msPerSimHour = REAL_DAY_MS / WEEK; // ≈ 514 286 ms at speed 1

    clock.now = T0 + 300_000;
    expect(run.tick()).toBe(0);
    expect(run.state.t).toBe(PRELUDE_HOURS);
    expect(run.time.carryMs).toBeCloseTo(300_000, 3);

    clock.now = T0 + 600_000; // 300 000 elapsed + 300 000 carried ≥ one sim-hour
    expect(run.tick()).toBe(1);
    expect(run.state.t).toBe(PRELUDE_HOURS + 1);
    expect(run.time.carryMs).toBeCloseTo(600_000 - msPerSimHour, 3);

    clock.now = T0 + REAL_HOUR_MS;
    expect(run.tick()).toBe(6); // 7 sim-hours per real hour, one already taken
    expect(run.state.t).toBe(PRELUDE_HOURS + 7);
    expect(run.lastAdvance?.hours).toBe(6);
  }, SLOW);

  test('tick-driven advances with no dispatch never touch payoff', () => {
    const { run, clock } = harness();
    run.newRun(1);
    clock.now = T0 + REAL_DAY_MS;
    expect(run.tick()).toBe(WEEK);
    clock.now = T0 + 2 * REAL_DAY_MS;
    expect(run.tick()).toBe(WEEK);
    expect(run.payoff).toBeNull();
    expect(run.pendingAction).toBeNull();
  }, SLOW);

  test('pause stops the clock; resume moves the stamp so paused time never accrues', () => {
    const { run, clock } = harness();
    run.newRun(1);
    run.pause();
    expect(run.time.paused).toBe(true);
    clock.now = T0 + REAL_DAY_MS;
    expect(run.tick()).toBe(0);
    expect(run.state.t).toBe(PRELUDE_HOURS);

    run.resume();
    expect(run.time.paused).toBe(false);
    expect(run.time.stampMs).toBe(T0 + REAL_DAY_MS);
    clock.now = T0 + REAL_DAY_MS + REAL_HOUR_MS;
    expect(run.tick()).toBe(7);
    expect(run.state.t).toBe(PRELUDE_HOURS + 7);
  }, SLOW);

  test('setSpeed settles at the old speed first, then re-prices wall time', () => {
    const { run, clock } = harness();
    run.newRun(1);
    clock.now = T0 + REAL_HOUR_MS;
    run.setSpeed(24);
    expect(run.state.t).toBe(PRELUDE_HOURS + 7); // one real hour at 1×
    expect(run.time.speed).toBe(24);
    clock.now = T0 + 2 * REAL_HOUR_MS;
    expect(run.tick()).toBe(WEEK); // one real hour at 24× = one sim-week
    expect(run.state.t).toBe(PRELUDE_HOURS + 7 + WEEK);
  }, SLOW);

  test('catch-up is capped at MAX_CATCHUP_HOURS', () => {
    const { run, clock } = harness();
    run.newRun(1);
    run.setSpeed(1008);
    clock.now = T0 + 30 * REAL_DAY_MS;
    expect(run.tick()).toBe(MAX_CATCHUP_HOURS);
    expect(run.state.t).toBeLessThanOrEqual(PRELUDE_HOURS + MAX_CATCHUP_HOURS);
  }, SLOW);
});

describe('payoff', () => {
  test('the badge follows the first action since the last badge, after PAYOFF_MIN_HOURS', () => {
    const { run } = harness();
    run.newRun(1);
    expect(PAYOFF_MIN_HOURS).toBe(24);

    run.dispatch(fixA);
    expect(run.pendingAction).toEqual({ t: PRELUDE_HOURS, runwayWeeks: run.runwayWeeks() });
    const runwayAtAction = run.runwayWeeks()!;
    run.advance(1);
    expect(run.payoff).toBeNull();
    expect(run.pendingAction).not.toBeNull();

    run.advance(WEEK - 1);
    const first = run.payoff as Payoff;
    expect(first).not.toBeNull();
    expect(first.hoursSinceAction).toBe(WEEK);
    expect(first.actionT).toBe(PRELUDE_HOURS);
    expect(first.atT).toBe(PRELUDE_HOURS + WEEK);
    expect(first.bought.kind).toBe('delta');
    if (first.bought.kind === 'delta') {
      expect(first.bought.weeks).toBeGreaterThanOrEqual(2);
      // The honest number: runway now against the runway at the action less the week elapsed.
      expect(first.bought.weeks).toBeCloseTo(run.runwayWeeks()! - (runwayAtAction - 1), 6);
    }
    expect(run.pendingAction).toBeNull();

    // No action pending: a further advance leaves the payoff identical.
    run.advance(WEEK);
    expect(run.payoff).toBe(first);

    // All three fixes, four weeks → climbing.
    run.dispatch(fixB);
    for (const a of fixC(run)) run.dispatch(a);
    expect(run.pendingAction?.t).toBe(PRELUDE_HOURS + 2 * WEEK);
    run.advance(4 * WEEK);
    expect(run.runwayWeeks()).toBeNull();
    expect(run.projectedZero()).toBeNull();
    expect(run.payoff?.bought).toEqual({ kind: 'climbing' });
    expect(run.payoff?.hoursSinceAction).toBe(4 * WEEK);

    // Undo the trivial rule → the run stops climbing: nowFinite, never "climbing".
    run.dispatch({ type: 'routing.remove', ruleId: 'op-trivial' });
    expect(run.pendingAction).toEqual({ t: PRELUDE_HOURS + 6 * WEEK, runwayWeeks: null });
    run.advance(WEEK);
    expect(run.payoff?.bought.kind).toBe('nowFinite');
    if (run.payoff?.bought.kind === 'nowFinite') {
      expect(Number.isFinite(run.payoff.bought.runwayWeeks)).toBe(true);
      expect(run.payoff.bought.runwayWeeks).toBeGreaterThan(0);
    }

    // dispatch + advance(1): under PAYOFF_MIN_HOURS, the badge is untouched.
    const before = run.payoff;
    run.dispatch(fixA);
    run.advance(1);
    expect(run.payoff).toBe(before);
    expect(run.pendingAction?.t).toBe(PRELUDE_HOURS + 7 * WEEK);

    // Everything above replays exactly.
    expect(replay(run.log, run.state.t)).toEqual(run.state);
    expect(verifyCheckpoints(run.log).ok).toBe(true);
  }, SLOW);

  test('a second dispatch before the payoff keeps the first baseline', () => {
    const { run } = harness();
    run.newRun(1);
    run.dispatch(fixA);
    const pending = run.pendingAction;
    run.advance(5);
    run.dispatch(fixB);
    expect(run.pendingAction).toBe(pending);
    run.advance(PAYOFF_MIN_HOURS - 5);
    expect(run.payoff?.actionT).toBe(PRELUDE_HOURS);
    expect(run.payoff?.hoursSinceAction).toBe(PAYOFF_MIN_HOURS);
  }, SLOW);
});

describe('bankruptcy', () => {
  test('an untouched run goes bankrupt in the [23, 30] week window and then advances no further', () => {
    const { run } = harness();
    run.newRun(1);
    run.advance(31 * WEEK);
    expect(run.state.status).toBe('bankrupt');
    const week = (run.state.bankruptAt! - PRELUDE_HOURS) / WEEK;
    expect(week).toBeGreaterThanOrEqual(23);
    expect(week).toBeLessThanOrEqual(30);
    const t = run.state.t;
    const report = run.advance(24);
    expect(run.state.t).toBe(t);
    expect(report.cashDelta).toBe(0);
    expect(run.state.cash).toBe(0);
  }, SLOW);
});

describe('onChange', () => {
  test('listeners see every mutation and can unsubscribe', () => {
    const { run } = harness();
    let calls = 0;
    const off = run.onChange((r) => {
      expect(r).toBe(run);
      calls += 1;
    });
    run.newRun(1);
    const afterNew = calls;
    expect(afterNew).toBeGreaterThan(0);
    run.advance(1);
    run.dispatch(fixA);
    run.pause();
    run.resume();
    run.setSpeed(168);
    expect(calls).toBeGreaterThan(afterNew + 4);
    off();
    run.advance(1);
    const frozen = calls;
    run.advance(1);
    expect(calls).toBe(frozen);
  }, SLOW);
});
