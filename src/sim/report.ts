/**
 * `bun run src/sim/report.ts [seed]` — the tuning report. Plan §3.6, §7 T3.
 *
 * Prints the opening-month P&L by line, runway, bankruptcy week, the opening
 * slope, the slope after each single fix and after all three, and the
 * `bleeds: all false` baseline. No other IO. Tune `constants.ts` until the
 * numbers land inside the bands `tests/sim/economy.test.ts` pins.
 */
import type { Action, SimConfig, SimState } from './types';
import { createRng } from './rng';
import { PRELUDE_HOURS } from './time';
import { CONSTANTS, DEFAULT_CONFIG, configWithBleeds } from './constants';
import { createState, applyAction } from './events';
import { step } from './step';
import { runwayMonths, slopePerWeek, trailingHours } from './metrics';

const c = CONSTANTS;
const WEEK = c.HOURS_PER_WEEK;
const MONTH = c.HOURS_PER_MONTH;
/** Stop looking for bankruptcy after this many weeks. */
const MAX_WEEKS = 60;

export const FIX_A: Action = {
  type: 'routing.set',
  rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' },
};
export const FIX_B: Action = {
  type: 'fleet.policy',
  fleetId: 'halberd-monitor',
  patch: { retry: { circuitBreaker: true, backoff: 'exponential' } },
};
export function fixC(state: SimState): Action[] {
  return state.world.bleeds.idle.map((id) => ({ type: 'fleet.policy', fleetId: id, patch: { scaleToZero: true } }));
}

function money(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${(Math.abs(n) / 1e6).toFixed(2)}M`;
}

function apply(state: SimState, actions: Action[]): SimState {
  return actions.reduce((s, a) => applyAction(s, a), state);
}

/** Opening-month P&L from the trailing week at login, scaled to a sim-month. */
function pnl(state: SimState): Record<string, string> {
  const week = trailingHours(state, WEEK);
  const scale = MONTH / week.length;
  const world = state.world;
  const bleedFleets = new Set<string>([world.bleeds.tiering ?? '', world.bleeds.retryStorm ?? '', ...world.bleeds.idle]);
  const lines = { revenue: 0, tokensHealthy: 0, tokensA: 0, tokensB: 0, capacityHealthy: 0, capacityA: 0, capacityB: 0, capacityC: 0, opex: 0 };
  for (const h of week) {
    lines.revenue += h.revenue;
    lines.opex += h.opex;
    for (const id in h.byWorkload) {
      const fleetId = world.workloads[id].fleetId;
      const cost = h.byWorkload[id].tokenCost;
      if (fleetId === world.bleeds.tiering) lines.tokensA += cost;
      else if (fleetId === world.bleeds.retryStorm) lines.tokensB += cost;
      else lines.tokensHealthy += cost;
    }
    for (const fleetId in h.capacityByFleet) {
      const cost = h.capacityByFleet[fleetId];
      if (fleetId === world.bleeds.tiering) lines.capacityA += cost;
      else if (fleetId === world.bleeds.retryStorm) lines.capacityB += cost;
      else if (bleedFleets.has(fleetId)) lines.capacityC += cost;
      else lines.capacityHealthy += cost;
    }
  }
  const tokens = lines.tokensHealthy + lines.tokensA + lines.tokensB;
  const capacity = lines.capacityHealthy + lines.capacityA + lines.capacityB + lines.capacityC;
  const cost = tokens + capacity + lines.opex;
  const row = (v: number): string => money(v * scale);
  return {
    revenue: row(lines.revenue),
    'tokens · healthy': row(lines.tokensHealthy),
    'tokens · A (tiering)': row(lines.tokensA),
    'tokens · B (retry storm)': row(lines.tokensB),
    'tokens · total': row(tokens),
    'capacity · healthy': row(lines.capacityHealthy),
    'capacity · A slots': row(lines.capacityA),
    'capacity · B slots': row(lines.capacityB),
    'capacity · C (idle)': row(lines.capacityC),
    'capacity · total': row(capacity),
    opex: row(lines.opex),
    cost: row(cost),
    burn: row(cost - lines.revenue),
  };
}

function bankruptcyWeek(login: SimState, config: SimConfig): string {
  const rng = createRng(login.seed);
  let s = login;
  for (let w = 0; w < MAX_WEEKS && s.status === 'running'; w++) s = step(s, WEEK, config, rng);
  return s.bankruptAt === null ? `> ${MAX_WEEKS} wk` : `${((s.bankruptAt - PRELUDE_HOURS) / WEEK).toFixed(1)} wk`;
}

function slopeAfter(login: SimState, actions: Action[], weeks: number, config: SimConfig): number {
  const rng = createRng(login.seed);
  return slopePerWeek(step(apply(login, actions), weeks * WEEK, config, rng), config);
}

export function report(seed: number): void {
  const login = createState(seed, DEFAULT_CONFIG);
  const slope0 = slopePerWeek(login);
  const runway = runwayMonths(login);

  console.log(`spaghetti sim report · seed ${seed} · login at t = ${login.t}`);
  console.table(pnl(login));
  console.table({
    'opening slope / wk': money(slope0),
    'runway (mo)': runway === null ? 'climbing' : runway.toFixed(2),
    'bankruptcy (wk from login)': bankruptcyWeek(login, DEFAULT_CONFIG),
    'cash at login': money(login.cash),
  });

  const fixes: Record<string, Action[]> = {
    'fix A (trivial → small)': [FIX_A],
    'fix B (circuit breaker)': [FIX_B],
    'fix C (scale to zero)': fixC(login),
    'fix A + B': [FIX_A, FIX_B],
    'fix A + B + C': [FIX_A, FIX_B, ...fixC(login)],
    'pause summarizer-east': [{ type: 'fleet.policy', fleetId: 'summarizer-east', patch: { status: 'paused' } }],
    'pause halberd-monitor': [{ type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { status: 'paused' } }],
  };
  const rows: Record<string, Record<string, string>> = {};
  for (const name in fixes) {
    const s2 = slopeAfter(login, fixes[name], 2, DEFAULT_CONFIG);
    const s4 = slopeAfter(login, fixes[name], 4, DEFAULT_CONFIG);
    rows[name] = { 'slope/wk after 2 wk': money(s2), 'ratio vs opening': (s2 / slope0).toFixed(2), 'slope/wk after 4 wk': money(s4) };
  }
  console.table(rows);

  const baseline = createState(seed, configWithBleeds({ tiering: false, retryStorm: false, idle: false }));
  console.table({ 'bleeds: all false · slope / wk at login': money(slopePerWeek(baseline)) });
}

if (import.meta.main) {
  const seed = Number.parseInt(process.argv[2] ?? '1', 10);
  report(Number.isFinite(seed) ? seed : 1);
}
