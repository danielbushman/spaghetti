/**
 * Selectors (plan §3.8, §6 T3).
 *
 *   bun test tests/sim/metrics.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { Action } from '../../src/sim/types';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG, configWithBleeds } from '../../src/sim/constants';
import { applyAction, createState } from '../../src/sim/events';
import { step } from '../../src/sim/step';
import { PRELUDE_HOURS } from '../../src/sim/time';
import {
  fleetDetail,
  fleetSummaries,
  headline,
  openIncidents,
  projectedZero,
  routingTable,
  runwayMonths,
  runwayWeeks,
  slopePerWeek,
  weeksBought,
} from '../../src/sim/metrics';

/** Bun's default per-test timeout is 5 s; a prelude alone is ~700 ticks. */
const SLOW = 60_000;

const c = DEFAULT_CONFIG.constants;
const WEEK = c.HOURS_PER_WEEK;
const login = createState(1);

const fixA: Action = { type: 'routing.set', rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' } };
const fixB: Action = { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { retry: { circuitBreaker: true, backoff: 'exponential' } } };

describe('slope, runway, projection', () => {
  test('opening slope ≈ −$5.6M/wk, runway ≈ 6.2 mo (±10%)', () => {
    const slope = slopePerWeek(login);
    expect(slope).toBeLessThan(0);
    expect(Math.abs(slope / -5.6e6 - 1)).toBeLessThan(0.1);
    const months = runwayMonths(login)!;
    expect(Math.abs(months / 6.2 - 1)).toBeLessThan(0.1);
    const weeks = runwayWeeks(login)!;
    expect(weeks).toBeCloseTo((months * c.HOURS_PER_MONTH) / WEEK, 6);
    expect(weeks).toBeCloseTo(login.cash / -slope, 6);
  }, SLOW);

  test('projectedZero is the linear projection of the trailing-week slope', () => {
    const pz = projectedZero(login)!;
    expect(pz.weeksFromNow).toBeCloseTo(runwayWeeks(login)!, 9);
    expect(pz.atT).toBeCloseTo(login.t + pz.weeksFromNow * WEEK, 6);
  }, SLOW);

  test('runway is null and projectedZero null when the slope is ≥ 0', () => {
    const clean = createState(2, configWithBleeds({ tiering: false, retryStorm: false, idle: false }));
    expect(slopePerWeek(clean)).toBeGreaterThan(0);
    expect(runwayMonths(clean)).toBeNull();
    expect(runwayWeeks(clean)).toBeNull();
    expect(projectedZero(clean)).toBeNull();
  }, SLOW);

  test('weeksBought: delta (positive, ≈ 0, negative), climbing, nowFinite', () => {
    const up = weeksBought(26, 40, WEEK);
    expect(up).toEqual({ kind: 'delta', weeks: 40 - 25 });
    const same = weeksBought(26, 25, WEEK) as { kind: 'delta'; weeks: number };
    expect(same.kind).toBe('delta');
    expect(Math.abs(same.weeks)).toBeLessThan(1e-9);
    const down = weeksBought(26, 20, WEEK) as { kind: 'delta'; weeks: number };
    expect(down.weeks).toBeLessThan(0);
    expect(weeksBought(26, null, WEEK)).toEqual({ kind: 'climbing' });
    expect(weeksBought(null, null, WEEK)).toEqual({ kind: 'climbing' });
    expect(weeksBought(null, 26, WEEK)).toEqual({ kind: 'nowFinite', runwayWeeks: 26 });
    // The baseline never goes below 0 when more time has passed than the runway had.
    expect(weeksBought(1, 3, 4 * WEEK)).toEqual({ kind: 'delta', weeks: 3 });
  }, SLOW);
});

describe('headline', () => {
  test('four signals with 28-point histories at login', () => {
    const signals = headline(login);
    expect(signals.map((s) => s.id)).toEqual(['runway', 'net', 'tokens', 'errors']);
    for (const s of signals) {
      expect(s.history.length).toBe(28);
      for (const v of s.history) expect(Number.isFinite(v)).toBe(true);
    }
    const byId = Object.fromEntries(signals.map((s) => [s.id, s]));
    expect(byId.runway.value).toBeCloseTo(runwayMonths(login)!, 9);
    expect(byId.net.value).toBeCloseTo(slopePerWeek(login), 6);
    expect(byId.tokens.value).toBeGreaterThan(1e10); // ≈ 2.6T/mo ≈ 85B/day
    expect(byId.errors.value).toBeGreaterThan(0);
    expect(byId.errors.value).toBeLessThan(c.MAX_ERROR_RATE);
    // The last history point is the login day; net history ends near the trailing-week slope.
    expect(Math.abs(byId.net.history[27] / slopePerWeek(login) - 1)).toBeLessThan(0.05);
  }, SLOW);
});

describe('incidents', () => {
  test('retry-storm on halberd-monitor is open at login, since ≤ PRELUDE_HOURS − 600', () => {
    const open = openIncidents(login);
    const storm = open.find((i) => i.kind === 'retry-storm')!;
    expect(storm).toBeDefined();
    expect(storm.fleetId).toBe('halberd-monitor');
    expect(storm.since).toBeLessThanOrEqual(PRELUDE_HOURS - 600);
    expect(storm.costPerDay).toBeGreaterThan(50_000); // ≈ $2.9M/mo wasted ≈ $95k/day
    expect(storm.summary).toMatch(/attempts\/job/);
    expect(open.filter((i) => i.kind === 'backlog').length).toBe(0);
    expect(open.filter((i) => i.kind === 'retry-storm').length).toBe(1);
  }, SLOW);

  test('the storm at login is saturated: p ≈ 0.61, ≈ 2.35 attempts/job', () => {
    const rt = login.fleets['halberd-monitor'];
    expect(rt.errorRate).toBeCloseTo(0.61, 2);
    expect(rt.attemptsPerJob).toBeCloseTo(2.35, 1);
    expect(rt.stormExcess).toBeCloseTo(c.STORM_EXCESS_CAP, 9);
    expect(rt.breakerOpen).toBe(false);
  }, SLOW);

  test('enabling the circuit breaker closes the incident within 24 h and the storm drains', () => {
    const rng = createRng(1);
    const s1 = step(applyAction(login, fixB), 1, DEFAULT_CONFIG, rng);
    expect(s1.fleets['halberd-monitor'].breakerOpen).toBe(true);
    expect(s1.fleets['halberd-monitor'].attemptsPerJob).toBeCloseTo(1, 9);
    const s24 = step(s1, 23, DEFAULT_CONFIG, rng);
    expect(openIncidents(s24).some((i) => i.kind === 'retry-storm')).toBe(false);
    expect(s24.fleets['halberd-monitor'].stormExcess).toBeLessThan(c.BREAKER_RESET);
    expect(s24.fleets['halberd-monitor'].slaBreached).toBe(false);
    const s72 = step(s24, 48, DEFAULT_CONFIG, rng);
    expect(s72.fleets['halberd-monitor'].breakerOpen).toBe(false);
    expect(s72.fleets['halberd-monitor'].stormExcess).toBeLessThan(0.01);
    expect(s72.fleets['halberd-monitor'].attemptsPerJob).toBeLessThan(1.05);
  }, SLOW);
});

describe('fleet summaries and detail', () => {
  const summaries = fleetSummaries(login);

  test('one row per fleet in fleetOrder; summarizer-east serves smb and tops cost/day', () => {
    expect(summaries.map((s) => s.id)).toEqual(login.world.fleetOrder);
    const east = summaries.find((s) => s.id === 'summarizer-east')!;
    expect(east.serves.map((x) => x.id)).toContain('smb');
    expect(east.serves.find((x) => x.id === 'smb')!.arrPerMonth).toBeGreaterThan(2.5e6);
    expect(east.tierMix.frontier).toBeCloseTo(1, 9);
    expect(east.costHistory7d.length).toBe(7);
    const sorted = summaries.slice().sort((a, b) => b.costPerDay - a.costPerDay);
    expect(sorted[0].id).toBe('summarizer-east');
    // ≈ $13.4M/mo tokens + $0.75M/mo slots ≈ $465k/day.
    expect(east.costPerDay).toBeGreaterThan(380_000);
    expect(east.costPerDay).toBeLessThan(560_000);
  }, SLOW);

  test('halberd-monitor reads as a storm; idle rivers read as idle reservations', () => {
    const halberd = summaries.find((s) => s.id === 'halberd-monitor')!;
    expect(halberd.attemptsPerJob).toBeGreaterThan(1.8);
    expect(halberd.errorRate).toBeGreaterThan(0.3);
    expect(halberd.serves.map((x) => x.id).sort()).toEqual(['enterprise', 'fintech', 'halberd-capital']);
    for (const id of login.world.bleeds.idle) {
      const s = summaries.find((x) => x.id === id)!;
      expect(s.utilization).toBeLessThan(0.05);
      expect(s.slots).toBe(c.world.idleSlotsPerFleet);
      expect(s.queueDepth).toBeLessThan(1e-6);
      expect(s.tokensPerDay).toBeLessThan(1e5);
      expect(s.costPerDay).toBeGreaterThan(50_000);
    }
  }, SLOW);

  test('fleet detail for summarizer-east: two trivial workloads on frontier via cf-summarizer-east, small ≤ 5% of cost', () => {
    const d = fleetDetail(login, 'summarizer-east')!;
    expect(d).not.toBeNull();
    expect(d.workloads.length).toBe(2);
    for (const w of d.workloads) {
      expect(w.sizeClass).toBe('trivial');
      expect(w.tier).toBe('frontier');
      expect(w.ruleId).toBe('cf-summarizer-east');
      expect(w.minTier).toBe('small');
      expect(Math.abs(w.avgTokensPerJob / 220 - 1)).toBeLessThan(0.1);
      expect(w.repricedPerDay.small).toBeLessThanOrEqual(0.05 * w.costPerDay);
      expect(w.repricedPerDay.frontier).toBeGreaterThan(w.repricedPerDay.medium);
    }
    expect(d.notes.some((n) => n.text.includes('summarizer-east is on the big model'))).toBe(true);
    expect(d.tokenCurve7d.length).toBe(WEEK);
    expect(d.tokenCurve7d[0].byTier.frontier).toBeGreaterThan(0);
    expect(d.policy.status).toBe('active');
    expect(d.incidents).toEqual([]);
    expect(fleetDetail(login, 'no-such-fleet')).toBeNull();
  }, SLOW);

  test('halberd-monitor detail: error budget burned many times over, its storm incident attached', () => {
    const d = fleetDetail(login, 'halberd-monitor')!;
    expect(d.errorBudgetUsed).toBeGreaterThan(10);
    expect(d.incidents.length).toBe(1);
    expect(d.incidents[0].kind).toBe('retry-storm');
    expect(d.workloads[0].minTier).toBe('frontier');
    expect(d.workloads[0].sizeClass).toBe('heavy');
  }, SLOW);
});

describe('routing table', () => {
  const table = routingTable(login);

  test('rules with coverage; the trivial × frontier cell ≈ $440k/day, re-priced small ≤ 5%, 0 below floor', () => {
    const cf = table.rows.find((r) => r.rule.id === 'cf-summarizer-east')!;
    expect(cf).toBeDefined();
    expect(cf.workloadsCovered.sort()).toEqual(login.world.fleets['summarizer-east'].workloadIds.slice().sort());
    expect(cf.costPerDay).toBeGreaterThan(350_000);
    const cell = table.grid.trivial.frontier;
    expect(Math.abs(cell.costPerDay / 440_000 - 1)).toBeLessThan(0.15);
    expect(cell.repricedPerDay.small).toBeLessThanOrEqual(0.05 * cell.costPerDay);
    expect(Math.abs(cell.repricedPerDay.frontier / cell.costPerDay - 1)).toBeLessThan(0.1);
    expect(cell.belowFloor.small).toBe(0);
    expect(cell.jobsPerDay).toBeGreaterThan(5e6 * 24 * 0.8);
  }, SLOW);

  test('heavy work below its floor is counted; the flat workload list resolves every workload', () => {
    const heavyFrontier = table.grid.heavy.frontier;
    expect(heavyFrontier.belowFloor.small).toBeGreaterThan(0);
    expect(heavyFrontier.belowFloor.frontier).toBe(0);
    const n = login.world.fleetOrder.reduce((s, id) => s + login.world.fleets[id].workloadIds.length, 0);
    expect(table.workloads.length).toBe(n);
    const watch = table.workloads.find((w) => w.fleetId === 'halberd-monitor')!;
    expect(watch.tier).toBe('frontier');
    expect(watch.ruleId).toBeNull();
  }, SLOW);

  test('after trivial → small and a week, the trivial × frontier cell is ≈ 0 and the small cell carries the work', () => {
    const fixed = step(applyAction(login, fixA), WEEK, DEFAULT_CONFIG, createRng(1));
    const g = routingTable(fixed).grid;
    expect(g.trivial.frontier.costPerDay).toBe(0);
    expect(g.trivial.small.jobsPerDay).toBeGreaterThan(5e6 * 24 * 0.8);
    expect(g.trivial.small.costPerDay).toBeLessThan(0.05 * table.grid.trivial.frontier.costPerDay);
    const row = routingTable(fixed).rows.find((r) => r.rule.id === 'op-trivial')!;
    expect(row.workloadsCovered).toContain('summarizer-east/ticket-summary');
    expect(routingTable(fixed).rows[0].rule.id).toBe('op-trivial');
  }, SLOW);
});
