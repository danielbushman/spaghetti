/**
 * Spend Explorer selector. Plan §3.8 (T3).
 *
 * Cost = tokens + reserved capacity. Capacity is attributed to the fleet,
 * then through workload job shares (a fleet with no jobs puts it on its
 * first workload so idle fleets still show as `$53k/day · 0 tokens`).
 * Customer attribution = Σ workload cost × `customerShares`. Totals agree
 * across group-bys to 1e-6 relative because every share set sums to 1.
 *
 * `link` is a typed target; the console builds the href. This module never
 * emits a route.
 */
import type { SimConfig, SimState, Tier } from './types';
import { DEFAULT_CONFIG } from './constants';
import { resolveTier } from './step';
import { attributeCapacity, trailingDays, trailingHours, type LedgerSample } from './metrics';

export interface ExploreQuery {
  range: '24h' | '7d' | '28d' | 'run';
  groupBy: 'fleet' | 'model' | 'workload' | 'customer';
  /** Keep the largest N series and fold the rest into `other` (default 10). */
  top?: number;
  /** Filter to one fleet's workloads before grouping, for every groupBy. */
  fleetId?: string;
}

export type ExploreLink =
  | { kind: 'fleet'; id: string }
  | { kind: 'workload'; id: string; fleetId: string }
  | { kind: 'tier'; id: Tier }
  | { kind: 'customer'; id: string };

export interface ExploreSeries {
  key: string;
  label: string;
  values: number[];
  total: number;
  tokens: number;
  link: ExploreLink | null;
}

export interface ExploreResult {
  bucketHours: 1 | 24;
  bucketT: number[];
  series: ExploreSeries[];
  total: number;
  tokens: number;
}

export const EXPLORE_DEFAULT_TOP = 10;
export const OTHER_KEY = 'other';

const HOURS_PER_DAY = 24;

interface Accumulator {
  values: number[];
  tokenValues: number[];
  label: string;
  link: ExploreLink | null;
}

export function explore(state: SimState, q: ExploreQuery, config: SimConfig = DEFAULT_CONFIG): ExploreResult {
  const c = config.constants;
  const world = state.world;

  let samples: LedgerSample[];
  let bucketT: number[];
  let bucketHours: 1 | 24;
  switch (q.range) {
    case '24h': {
      const hs = trailingHours(state, HOURS_PER_DAY);
      samples = hs;
      bucketT = hs.map((h) => h.t);
      bucketHours = 1;
      break;
    }
    case '7d': {
      const hs = trailingHours(state, c.HOURS_PER_WEEK);
      samples = hs;
      bucketT = hs.map((h) => h.t);
      bucketHours = 1;
      break;
    }
    case '28d': {
      const ds = trailingDays(state, c.HOURLY_WINDOW / HOURS_PER_DAY);
      samples = ds;
      bucketT = ds.map((d) => d.day * HOURS_PER_DAY);
      bucketHours = 24;
      break;
    }
    default: {
      const ds = state.daily;
      samples = ds;
      bucketT = ds.map((d) => d.day * HOURS_PER_DAY);
      bucketHours = 24;
    }
  }

  const fleetIds = q.fleetId === undefined ? world.fleetOrder : world.fleets[q.fleetId] ? [q.fleetId] : [];
  const n = samples.length;
  const acc = new Map<string, Accumulator>();
  const bump = (key: string, i: number, cost: number, tokens: number, label: string, link: ExploreLink | null): void => {
    let a = acc.get(key);
    if (!a) {
      a = { values: new Array<number>(n).fill(0), tokenValues: new Array<number>(n).fill(0), label, link };
      acc.set(key, a);
    }
    a.values[i] += cost;
    a.tokenValues[i] += tokens;
  };

  samples.forEach((s, i) => {
    for (const fleetId of fleetIds) {
      const fleet = world.fleets[fleetId];
      const jobs: Record<string, number> = {};
      for (const id of fleet.workloadIds) jobs[id] = s.byWorkload[id]?.jobs ?? 0;
      const capShare = attributeCapacity(fleet, s.capacityByFleet[fleetId] ?? 0, jobs);
      for (const id of fleet.workloadIds) {
        const rec = s.byWorkload[id];
        const cost = (rec?.tokenCost ?? 0) + capShare[id];
        const tokens = rec ? rec.tokensIn + rec.tokensOut : 0;
        if (cost === 0 && tokens === 0) continue;
        const w = world.workloads[id];
        switch (q.groupBy) {
          case 'fleet':
            bump(fleetId, i, cost, tokens, fleet.name, { kind: 'fleet', id: fleetId });
            break;
          case 'model': {
            const tier = rec ? rec.tier : resolveTier(state.routing, fleetId, w, fleet.defaultTier).tier;
            bump(tier, i, cost, tokens, `${tier} · ${world.models[tier].name}`, { kind: 'tier', id: tier });
            break;
          }
          case 'workload':
            bump(id, i, cost, tokens, `${fleetId} / ${w.name}`, { kind: 'workload', id, fleetId });
            break;
          case 'customer':
            for (const cid in w.customerShares) {
              const share = w.customerShares[cid];
              const cust = world.customers[cid];
              bump(cid, i, cost * share, tokens * share, cust ? cust.name : cid, { kind: 'customer', id: cid });
            }
            break;
        }
      }
    }
  });

  const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
  const all: ExploreSeries[] = [];
  for (const [key, a] of acc) all.push({ key, label: a.label, values: a.values, total: sum(a.values), tokens: sum(a.tokenValues), link: a.link });
  all.sort((x, y) => y.total - x.total || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  const top = Math.max(1, Math.floor(q.top ?? EXPLORE_DEFAULT_TOP));
  let series = all;
  if (all.length > top) {
    const kept = all.slice(0, top);
    const rest = all.slice(top);
    const values = new Array<number>(n).fill(0);
    let tokens = 0;
    for (const r of rest) {
      r.values.forEach((v, i) => (values[i] += v));
      tokens += r.tokens;
    }
    kept.push({ key: OTHER_KEY, label: OTHER_KEY, values, total: sum(values), tokens, link: null });
    series = kept;
  }

  return {
    bucketHours,
    bucketT,
    series,
    total: series.reduce((s, x) => s + x.total, 0),
    tokens: series.reduce((s, x) => s + x.tokens, 0),
  };
}
