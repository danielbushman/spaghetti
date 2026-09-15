/**
 * Invariants under random play (plan §6 T3).
 *
 *   bun test tests/sim/invariants.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { Action, SimState } from '../../src/sim/types';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG } from '../../src/sim/constants';
import { applyAction, createState } from '../../src/sim/events';
import { hourArrivals, step } from '../../src/sim/step';
import { explore } from '../../src/sim/explore';
import { fleetDetail, fleetSummaries, headline, openIncidents, routingTable } from '../../src/sim/metrics';

/** Bun's default per-test timeout is 5 s; a prelude alone is ~700 ticks. */
const SLOW = 60_000;

const c = DEFAULT_CONFIG.constants;
const WEEK = c.HOURS_PER_WEEK;

/** Walk any value; every number must be finite. Returns the first bad path. */
function firstNonFinite(x: unknown, path = '$'): string | null {
  if (typeof x === 'number') return Number.isFinite(x) ? null : `${path} = ${x}`;
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const bad = firstNonFinite(x[i], `${path}[${i}]`);
      if (bad) return bad;
    }
    return null;
  }
  if (x && typeof x === 'object') {
    for (const k of Object.keys(x)) {
      const bad = firstNonFinite((x as Record<string, unknown>)[k], `${path}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
}

function checkRuntime(s: SimState): void {
  for (const id of s.world.fleetOrder) {
    const rt = s.fleets[id];
    expect(rt.queueDepth).toBeGreaterThanOrEqual(0);
    expect(rt.slotsProvisioned).toBeGreaterThanOrEqual(0);
    expect(rt.slotsNeeded).toBeGreaterThanOrEqual(0);
    expect(rt.errorRate).toBeGreaterThanOrEqual(0);
    expect(rt.errorRate).toBeLessThanOrEqual(c.MAX_ERROR_RATE);
    expect(rt.utilization).toBeGreaterThanOrEqual(0);
    expect(rt.utilization).toBeLessThanOrEqual(1);
    expect(rt.attemptsPerJob).toBeGreaterThanOrEqual(0);
  }
  const last = s.hourly[s.hourly.length - 1];
  expect(last.tokenCost).toBeGreaterThanOrEqual(0);
  expect(last.capacityCost).toBeGreaterThanOrEqual(0);
  expect(last.tokens).toBeGreaterThanOrEqual(0);
  for (const id in last.byWorkload) {
    const w = last.byWorkload[id];
    expect(w.jobs).toBeGreaterThanOrEqual(0);
    expect(w.attempts).toBeGreaterThanOrEqual(w.jobs);
    expect(w.tokensIn).toBeGreaterThanOrEqual(0);
    expect(w.tokensOut).toBeGreaterThanOrEqual(0);
    expect(w.tokenCost).toBeGreaterThanOrEqual(0);
  }
  expect(s.hourly.length).toBeLessThanOrEqual(c.HOURLY_WINDOW);
  expect(s.daily.length).toBe(Math.floor(s.t / 24));
}

function checkSelectors(s: SimState): void {
  expect(firstNonFinite(headline(s))).toBeNull();
  expect(firstNonFinite(fleetSummaries(s))).toBeNull();
  expect(firstNonFinite(openIncidents(s))).toBeNull();
  expect(firstNonFinite(routingTable(s))).toBeNull();
  expect(firstNonFinite(fleetDetail(s, 'halberd-monitor'))).toBeNull();
  for (const groupBy of ['fleet', 'model', 'workload', 'customer'] as const) {
    expect(firstNonFinite(explore(s, { range: '7d', groupBy }))).toBeNull();
  }
  expect(firstNonFinite(explore(s, { range: 'run', groupBy: 'fleet', top: 3 }))).toBeNull();
}

/** 200 seeded random actions, including pauses and concurrency 0. */
function randomActions(s: SimState, count: number): Action[] {
  const rng = createRng(2024).fork('actions');
  const fleets = s.world.fleetOrder;
  const tiers = ['small', 'medium', 'frontier'] as const;
  const classes = ['trivial', 'standard', 'heavy'] as const;
  const out: Action[] = [];
  for (let i = 0; i < count; i++) {
    const kind = rng.int(8);
    const fleetId = rng.pick(fleets);
    switch (kind) {
      case 0:
        out.push({ type: 'fleet.policy', fleetId, patch: { status: 'paused' } });
        break;
      case 1:
        out.push({ type: 'fleet.policy', fleetId, patch: { status: 'active' } });
        break;
      case 2:
        out.push({ type: 'fleet.policy', fleetId, patch: { concurrency: 0 } });
        break;
      case 3:
        out.push({ type: 'fleet.policy', fleetId, patch: { concurrency: rng.int(10_000), scaleToZero: rng.next() < 0.5 } });
        break;
      case 4:
        out.push({ type: 'fleet.policy', fleetId, patch: { retry: { maxAttempts: rng.int(7), backoff: rng.next() < 0.5 ? 'none' : 'exponential', circuitBreaker: rng.next() < 0.5 } } });
        break;
      case 5:
        out.push({ type: 'routing.set', rule: { id: `op-${rng.int(12)}`, priority: rng.int(100), match: { sizeClass: rng.pick(classes) }, tier: rng.pick(tiers), author: 'operator' } });
        break;
      case 6:
        out.push({ type: 'routing.set', rule: { id: `op-f-${rng.int(12)}`, priority: rng.int(100), match: { fleetId }, tier: rng.pick(tiers), author: 'operator' } });
        break;
      default:
        out.push({ type: 'routing.remove', ruleId: rng.next() < 0.5 ? `op-${rng.int(12)}` : 'cf-summarizer-east' });
    }
  }
  return out;
}

describe('invariants under 200 random actions over 26 weeks', () => {
  const seed = 21;
  const login = createState(seed);
  const actions = randomActions(login, 200);
  const rng = createRng(seed);
  const hoursTotal = 26 * WEEK;
  const every = Math.floor(hoursTotal / actions.length);
  /** Random play can bankrupt a company; the run then continues from a fresh seed so all 26 weeks are ticked. */
  const MAX_RESTARTS = 20;

  test('no NaN/Infinity, nothing negative, the ring and the days stay bounded', () => {
    let s = login;
    let next = 0;
    let ticked = 0;
    let restarts = 0;
    let pausedSeen = 0;
    let zeroSlotsSeen = 0;
    /** Tick `hours` sim-hours, restarting from a fresh state whenever the company goes bankrupt. */
    const advance = (hours: number): void => {
      let remaining = hours;
      while (remaining > 0) {
        const before = s.t;
        s = step(s, remaining, DEFAULT_CONFIG, rng);
        const done = s.t - before;
        ticked += done;
        remaining -= done;
        checkRuntime(s);
        if (s.status === 'bankrupt') {
          expect(s.bankruptAt).toBe(s.t);
          expect(firstNonFinite(s)).toBeNull();
          checkSelectors(s);
          restarts++;
          expect(restarts).toBeLessThanOrEqual(MAX_RESTARTS);
          s = createState(seed + restarts);
        }
      }
    };
    for (let i = 0; i < actions.length; i++) {
      s = applyAction(s, actions[next++]);
      // Every action gets `every` hours of ticks; the last one absorbs the remainder so exactly 26 weeks are ticked.
      advance(i === actions.length - 1 ? hoursTotal - ticked : every);
      for (const id of s.world.fleetOrder) {
        if (s.fleets[id].policy.status === 'paused') pausedSeen++;
        if (s.fleets[id].policy.concurrency === 0) zeroSlotsSeen++;
      }
      if (next % 25 === 0) checkSelectors(s);
    }
    expect(next).toBe(actions.length);
    expect(ticked).toBe(hoursTotal);
    expect(s.status).toBe('running');
    expect(s.bankruptAt).toBeNull();
    expect(s.t - login.t).toBeLessThanOrEqual(hoursTotal);
    if (restarts === 0) expect(s.t).toBe(login.t + hoursTotal);
    expect(pausedSeen).toBeGreaterThan(0);
    expect(zeroSlotsSeen).toBeGreaterThan(0);
    expect(firstNonFinite(s)).toBeNull();
    checkSelectors(s);
  }, SLOW);

  test("queue' ≤ a + queue for every fleet-hour, with random actions in place", () => {
    let s = applyAction(login, { type: 'fleet.policy', fleetId: 'summarizer-east', patch: { concurrency: 0 } });
    for (const a of actions.slice(0, 40)) s = applyAction(s, a);
    const hourRng = createRng(seed);
    for (let i = 0; i < 48; i++) {
      const arrivals = hourArrivals(s.world, s.t, c, hourRng.forHour(s.t));
      const before = s;
      s = step(s, 1, DEFAULT_CONFIG, hourRng);
      for (const id of s.world.fleetOrder) {
        let a = 0;
        for (const wid of s.world.fleets[id].workloadIds) a += arrivals[wid];
        expect(s.fleets[id].queueDepth).toBeLessThanOrEqual(a + before.fleets[id].queueDepth + 1e-6);
      }
    }
  }, SLOW);
});

describe('explicit cases', () => {
  test('one fleet paused for 2 weeks reads 0 error rate, 0 attempts/job, 0 error budget — never NaN', () => {
    const login = createState(22);
    const s = step(applyAction(login, { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { status: 'paused' } }), 2 * WEEK, DEFAULT_CONFIG, createRng(22));
    const rt = s.fleets['halberd-monitor'];
    expect(rt.errorRate).toBe(0);
    expect(rt.attemptsPerJob).toBe(0);
    expect(rt.slotsProvisioned).toBe(0);
    expect(rt.utilization).toBe(0);
    expect(rt.queueDepth).toBeGreaterThan(0);
    expect(rt.slaBreached).toBe(true);
    const detail = fleetDetail(s, 'halberd-monitor');
    expect(detail).not.toBeNull();
    expect(detail!.errorBudgetUsed).toBe(0);
    expect(detail!.errorRate).toBe(0);
    expect(detail!.costPerDay).toBe(0);
    expect(firstNonFinite(detail)).toBeNull();
    expect(openIncidents(s).some((i) => i.kind === 'backlog' && i.fleetId === 'halberd-monitor')).toBe(true);
  }, SLOW);

  test('every fleet paused for 2 weeks → headline error rate 0, nothing NaN, revenue 0', () => {
    const login = createState(23);
    const paused = login.world.fleetOrder.reduce<SimState>((s, id) => applyAction(s, { type: 'fleet.policy', fleetId: id, patch: { status: 'paused' } }), login);
    const s = step(paused, 2 * WEEK, DEFAULT_CONFIG, createRng(23));
    const signals = headline(s);
    expect(signals.find((x) => x.id === 'errors')!.value).toBe(0);
    expect(signals.find((x) => x.id === 'tokens')!.value).toBe(0);
    expect(firstNonFinite(signals)).toBeNull();
    expect(firstNonFinite(fleetSummaries(s))).toBeNull();
    expect(firstNonFinite(s)).toBeNull();
    for (const id of s.world.fleetOrder) {
      expect(s.fleets[id].errorRate).toBe(0);
      expect(s.fleets[id].attemptsPerJob).toBe(0);
    }
    expect(s.hourly[s.hourly.length - 1].revenue).toBe(0);
    const spend = explore(s, { range: '24h', groupBy: 'fleet' });
    expect(spend.total).toBe(0);
    expect(spend.series.length).toBe(0);
  }, SLOW);

  test('concurrency 0 on a busy fleet: work queues, nothing processes, no NaN', () => {
    const login = createState(24);
    const s = step(applyAction(login, { type: 'fleet.policy', fleetId: 'summarizer-east', patch: { concurrency: 0 } }), 48, DEFAULT_CONFIG, createRng(24));
    const rt = s.fleets['summarizer-east'];
    expect(rt.slotsProvisioned).toBe(0);
    expect(rt.utilization).toBe(0);
    expect(rt.attemptsPerJob).toBe(0);
    expect(rt.queueDepth).toBeGreaterThan(0);
    expect(firstNonFinite(s.fleets)).toBeNull();
  }, SLOW);
});
