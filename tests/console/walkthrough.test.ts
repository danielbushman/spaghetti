/**
 * The §1 walk, headless (plan §1, §6, §7 T9).
 *
 *   bun test tests/console/walkthrough.test.ts
 *
 * notice → investigate → act → wait → verify, on `RunController` over a
 * Map-backed Storage, asserting every number the plan's §1 quotes within
 * tolerance. The tests run in order and share one controller: the walk is
 * a sequence, and each step reads what the one before it left behind.
 * Nothing here imports a `.svelte` or `.svelte.ts` file.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { RunController } from '../../src/console/core/run';
import { load } from '../../src/console/persistence';
import { replay } from '../../src/sim/events';
import { CONSTANTS } from '../../src/sim/constants';
import { PRELUDE_HOURS } from '../../src/sim/time';
import type { Action } from '../../src/sim/types';
import type { ProjectedZero } from '../../src/sim/metrics';

const SLOW = 90_000;
const WEEK = CONSTANTS.HOURS_PER_WEEK;
const SEED = 1;
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

/** Step 3's lever: every trivial workload to the small model, priority 1. */
const trivialToSmall: Action = {
  type: 'routing.set',
  rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' },
};
/** The second lap: the circuit breaker on the storming fleet. */
const breakerOn: Action = {
  type: 'fleet.policy',
  fleetId: 'halberd-monitor',
  patch: { retry: { circuitBreaker: true, backoff: 'exponential' } },
};
/** The third lap: scale-to-zero on every idle river. */
function scaleRiversToZero(run: RunController): Action[] {
  return run.state.world.bleeds.idle.map((id) => ({ type: 'fleet.policy', fleetId: id, patch: { scaleToZero: true } }));
}

function shareOf(run: RunController, groupBy: 'fleet' | 'model', key: string): number {
  const r = run.explore({ range: '7d', groupBy });
  const s = r.series.find((x) => x.key === key);
  return s ? s.total / r.total : 0;
}

const storage = new MemStorage();
const run = new RunController({ storage, now: () => T0 });

// Readings the later steps compare against.
let slopeAtLogin = 0;
let runwayWeeksAtLogin: number | null = null;
let zeroAtLogin: ProjectedZero | null = null;
let frontierShareAtLogin = 0;
let cellCostAtLogin = 0;

beforeAll(() => {
  run.newRun(SEED);
});

describe('1 · notice — Overview at first login', () => {
  test('the clock reads login and the run is alive', () => {
    expect(run.state.t).toBe(PRELUDE_HOURS);
    expect(run.state.status).toBe('running');
    expect(run.state.cash).toBe(CONSTANTS.OPENING_CASH);
  });

  test('runway ≈ 6.2 sim-months, slope ≈ −$5.6M/sim-week', () => {
    const runway = run.runwayMonths();
    expect(runway).not.toBeNull();
    expect(runway as number).toBeGreaterThanOrEqual(5.5);
    expect(runway as number).toBeLessThanOrEqual(7.0);

    slopeAtLogin = run.slope();
    expect(slopeAtLogin).toBeGreaterThanOrEqual(-6.5e6);
    expect(slopeAtLogin).toBeLessThanOrEqual(-5.0e6);

    runwayWeeksAtLogin = run.runwayWeeks();
    zeroAtLogin = run.projectedZero();
    expect(zeroAtLogin).not.toBeNull();
  });

  test('one incident open: retry-storm · halberd-monitor, since before login', () => {
    const incidents = run.incidents();
    const storm = incidents.find((i) => i.kind === 'retry-storm' && i.fleetId === 'halberd-monitor');
    expect(storm).toBeDefined();
    expect(storm!.since).toBeLessThan(PRELUDE_HOURS);
    expect(storm!.costPerDay).toBeGreaterThan(0);
  });

  test('four headline signals, each with 28 days of history', () => {
    const h = run.headline();
    expect(h.map((s) => s.id)).toEqual(['runway', 'net', 'tokens', 'errors']);
    for (const s of h) expect(s.history.length).toBe(28);
  });
});

describe('2 · investigate — Spend Explorer and Fleet detail', () => {
  test('group by model: the frontier tier is ≥ 55% of spend', () => {
    frontierShareAtLogin = shareOf(run, 'model', 'frontier');
    expect(frontierShareAtLogin).toBeGreaterThanOrEqual(0.55);
  });

  test('group by fleet: summarizer-east sits on top at ≥ 30%', () => {
    const r = run.explore({ range: '7d', groupBy: 'fleet' });
    expect(r.series[0].key).toBe('summarizer-east');
    expect(r.series[0].total / r.total).toBeGreaterThanOrEqual(0.3);
    // every idle river is a row with cost and almost no tokens
    for (const id of run.state.world.bleeds.idle) {
      const row = r.series.find((s) => s.key === id);
      expect(row).toBeDefined();
      expect(row!.total).toBeGreaterThan(0);
      expect(row!.tokens).toBeLessThan(row!.total); // a trickle, never zero, never rounded away
    }
  });

  test('summarizer-east: jobs average ≈ 220 tokens, 100% on the frontier model, via cf-summarizer-east', () => {
    const f = run.fleet('summarizer-east');
    expect(f).not.toBeNull();
    expect(f!.workloads.length).toBeGreaterThan(0);
    for (const w of f!.workloads) {
      expect(w.sizeClass).toBe('trivial');
      expect(w.tier).toBe('frontier');
      expect(w.ruleId).toBe('cf-summarizer-east');
      expect(w.minTier).toBe('small');
      expect(w.avgTokensPerJob).toBeGreaterThanOrEqual(190);
      expect(w.avgTokensPerJob).toBeLessThanOrEqual(250);
    }
    expect(f!.tierMix.frontier).toBeCloseTo(1, 6);
    // the co-founder's note says why — and never addresses the player
    expect(f!.notes.length).toBeGreaterThan(0);
    for (const n of f!.notes) expect(n.text).not.toMatch(/\byou\b/i);
  });

  test('a model breakdown of summarizer-east alone is 100% frontier', () => {
    const r = run.explore({ range: '7d', groupBy: 'model', fleetId: 'summarizer-east' });
    expect(r.series.length).toBe(1);
    expect(r.series[0].key).toBe('frontier');
    expect(r.series[0].total).toBeCloseTo(r.total, 3);
  });
});

describe('3 · act — Models & Routing', () => {
  test("the co-founder's rule is visible: summarizer-east → frontier · eval pending", () => {
    const table = run.routing();
    const row = table.rows.find((r) => r.rule.id === 'cf-summarizer-east');
    expect(row).toBeDefined();
    expect(row!.rule.tier).toBe('frontier');
    expect(row!.rule.author).toBe('cofounder');
    expect(row!.rule.note).toContain('eval pending');
    expect(row!.workloadsCovered.length).toBeGreaterThan(0);
  });

  test('the trivial × frontier cell reads ≈ $440k/day; re-priced at small ≤ 5% of that; 0 below floor', () => {
    const cell = run.routing().grid.trivial.frontier;
    cellCostAtLogin = cell.costPerDay;
    expect(cell.costPerDay).toBeGreaterThanOrEqual(330_000);
    expect(cell.costPerDay).toBeLessThanOrEqual(550_000);
    expect(cell.repricedPerDay.small).toBeLessThanOrEqual(0.05 * cell.costPerDay);
    expect(cell.repricedPerDay.small).toBeGreaterThan(0);
    expect(cell.belowFloor.small).toBe(0);
  });

  test('add the rule trivial → small: one routing.set, nothing else moves yet', () => {
    const logBefore = run.log.length;
    run.dispatch(trivialToSmall);
    expect(run.log.length).toBe(logBefore + 1);
    expect(run.state.routing.some((r) => r.id === 'op-trivial')).toBe(true);
    expect(run.payoff).toBeNull(); // the badge waits for time to pass
    expect(run.pendingAction).not.toBeNull();
    // the rule now chooses the tier for the trivial workloads
    const f = run.fleet('summarizer-east');
    for (const w of f!.workloads) {
      expect(w.tier).toBe('small');
      expect(w.ruleId).toBe('op-trivial');
    }
  });
});

describe('4 · wait — +1 week', () => {
  test(
    'advance(168) reports the week',
    () => {
      const report = run.advance(WEEK);
      expect(report.hours).toBe(WEEK);
      expect(run.state.t).toBe(PRELUDE_HOURS + WEEK);
      expect(report.slopeBefore).toBeCloseTo(slopeAtLogin, 0);
    },
    SLOW,
  );
});

describe('5 · verify', () => {
  test('slope magnitude at least halves (≤ 0.6 × before)', () => {
    const slope = run.slope();
    expect(slope).toBeLessThan(0);
    expect(Math.abs(slope)).toBeLessThanOrEqual(0.6 * Math.abs(slopeAtLogin));
  });

  test('the top bar has its answer: payoff.bought = { kind: delta, weeks ≥ 2 }', () => {
    const p = run.payoff;
    expect(p).not.toBeNull();
    expect(p!.hoursSinceAction).toBe(WEEK);
    expect(p!.bought.kind).toBe('delta');
    if (p!.bought.kind === 'delta') expect(p!.bought.weeks).toBeGreaterThanOrEqual(2);
    expect(run.pendingAction).toBeNull();
  });

  test("the Overview's projection to zero swings right", () => {
    const zero = run.projectedZero();
    expect(zero).not.toBeNull();
    expect(zero!.atT).toBeGreaterThan(zeroAtLogin!.atT + WEEK);
    expect(run.runwayWeeks() as number).toBeGreaterThan(runwayWeeksAtLogin as number);
  });

  test("the Spend Explorer's frontier share collapses", () => {
    const share = shareOf(run, 'model', 'frontier');
    expect(share).toBeLessThanOrEqual(0.75 * frontierShareAtLogin);
    const cell = run.routing().grid.trivial.frontier;
    expect(cell.costPerDay).toBeLessThan(0.05 * cellCostAtLogin);
  });

  test('a further week with no action leaves the badge untouched', () => {
    const before = run.payoff;
    run.advance(WEEK);
    expect(run.payoff).toBe(before);
  }, SLOW);
});

describe('laps two and three — the inflection', () => {
  test(
    'breaker on + scale-to-zero, four weeks: climbing, no projected zero, badge says climbing',
    () => {
      run.dispatch(breakerOn);
      for (const a of scaleRiversToZero(run)) run.dispatch(a);
      run.advance(4 * WEEK);
      expect(run.slope()).toBeGreaterThan(0);
      expect(run.runwayWeeks()).toBeNull();
      expect(run.runwayMonths()).toBeNull();
      expect(run.projectedZero()).toBeNull();
      expect(run.payoff).not.toBeNull();
      expect(run.payoff!.bought.kind).toBe('climbing');
      expect(run.incidents().some((i) => i.kind === 'retry-storm')).toBe(false);
    },
    SLOW,
  );

  test('the whole walk is in the log and replays to the same state', () => {
    run.saveNow(); // advances save on a 250 ms debounce; flush like pagehide does
    const rec = load(storage);
    expect(rec).not.toBeNull();
    expect(rec!.seed).toBe(SEED);
    expect(rec!.time.t).toBe(run.state.t);
    const actions = rec!.log.filter((e) => e.type === 'routing.set' || e.type === 'fleet.policy');
    expect(actions.length).toBe(2 + run.state.world.bleeds.idle.length);
    expect(replay(rec!.log, run.state.t)).toEqual(run.state);
  }, SLOW);
});
