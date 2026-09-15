/**
 * Spend Explorer selector (plan §3.8, §6 T3).
 *
 *   bun test tests/sim/explore.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG } from '../../src/sim/constants';
import { applyAction, createState } from '../../src/sim/events';
import { step } from '../../src/sim/step';
import { explore, type ExploreQuery } from '../../src/sim/explore';
import { trailingDays, trailingHours } from '../../src/sim/metrics';

/** Bun's default per-test timeout is 5 s; a prelude alone is ~700 ticks. */
const SLOW = 60_000;

const c = DEFAULT_CONFIG.constants;
const GROUPS = ['fleet', 'model', 'workload', 'customer'] as const;
const RANGES = ['24h', '7d', '28d', 'run'] as const;

const login = createState(1);

function ledgerCost(range: ExploreQuery['range']): number {
  const samples =
    range === '24h' ? trailingHours(login, 24) : range === '7d' ? trailingHours(login, c.HOURS_PER_WEEK) : range === '28d' ? trailingDays(login, 28) : login.daily;
  return samples.reduce((s, x) => s + x.tokenCost + x.capacityCost, 0);
}

describe('explore', () => {
  test('totals agree across group-bys and equal the ledger (tokens + capacity) for every range', () => {
    for (const range of RANGES) {
      const ledger = ledgerCost(range);
      for (const groupBy of GROUPS) {
        const r = explore(login, { range, groupBy, top: 1000 });
        expect(Math.abs(r.total - ledger) / ledger).toBeLessThan(1e-6);
        const seriesSum = r.series.reduce((s, x) => s + x.total, 0);
        expect(Math.abs(seriesSum - r.total) / r.total).toBeLessThan(1e-9);
        for (const s of r.series) {
          expect(Math.abs(s.values.reduce((a, b) => a + b, 0) - s.total)).toBeLessThan(1e-6 * Math.max(1, s.total));
        }
      }
    }
  }, SLOW);

  test('bucket counts and sizes per range', () => {
    expect(explore(login, { range: '24h', groupBy: 'fleet' })).toMatchObject({ bucketHours: 1 });
    expect(explore(login, { range: '24h', groupBy: 'fleet' }).bucketT.length).toBe(24);
    expect(explore(login, { range: '7d', groupBy: 'fleet' }).bucketT.length).toBe(168);
    const d28 = explore(login, { range: '28d', groupBy: 'fleet' });
    expect(d28.bucketHours).toBe(24);
    expect(d28.bucketT.length).toBe(28);
    expect(d28.bucketT[0]).toBe(0);
    expect(d28.bucketT[27]).toBe(27 * 24);
    expect(explore(login, { range: 'run', groupBy: 'fleet' }).bucketT.length).toBe(28);
    for (const s of d28.series) expect(s.values.length).toBe(28);
  }, SLOW);

  test('top folds the rest into `other` with no link; default top is 10', () => {
    const r = explore(login, { range: '7d', groupBy: 'fleet' });
    expect(r.series.length).toBe(11);
    const other = r.series[r.series.length - 1];
    expect(other.key).toBe('other');
    expect(other.link).toBeNull();
    const all = explore(login, { range: '7d', groupBy: 'fleet', top: 100 });
    expect(all.series.length).toBe(40);
    expect(all.series.some((s) => s.key === 'other')).toBe(false);
    expect(Math.abs(all.total - r.total) / r.total).toBeLessThan(1e-9);
    const three = explore(login, { range: '7d', groupBy: 'fleet', top: 3 });
    expect(three.series.length).toBe(4);
    expect(three.series.slice(0, 3).map((s) => s.key)).toEqual(all.series.slice(0, 3).map((s) => s.key));
  }, SLOW);

  test('series are sorted by total descending and carry typed links, never routes', () => {
    const r = explore(login, { range: '7d', groupBy: 'fleet', top: 100 });
    for (let i = 1; i < r.series.length; i++) expect(r.series[i - 1].total).toBeGreaterThanOrEqual(r.series[i].total);
    expect(r.series[0].key).toBe('summarizer-east');
    expect(r.series[0].total / r.total).toBeGreaterThanOrEqual(0.3);
    expect(r.series[0].link).toEqual({ kind: 'fleet', id: 'summarizer-east' });
    const w = explore(login, { range: '24h', groupBy: 'workload', top: 100 }).series[0];
    expect(w.link).toEqual({ kind: 'workload', id: w.key, fleetId: 'summarizer-east' });
    for (const s of [...r.series, w]) expect(JSON.stringify(s)).not.toMatch(/#\//);
  }, SLOW);

  test('group by model: frontier ≥ 55% of spend at login; links point at the tier', () => {
    const r = explore(login, { range: '7d', groupBy: 'model' });
    const frontier = r.series.find((s) => s.key === 'frontier')!;
    expect(frontier.total / r.total).toBeGreaterThanOrEqual(0.55);
    expect(frontier.link).toEqual({ kind: 'tier', id: 'frontier' });
    expect(frontier.label).toContain(login.world.models.frontier.name);
  }, SLOW);

  test('group by customer: Halberd Capital is the largest named account; customer links have a target', () => {
    const r = explore(login, { range: '7d', groupBy: 'customer', top: 100 });
    const accounts = r.series.filter((s) => login.world.customers[s.key]?.kind === 'account');
    expect(accounts[0].key).toBe('halberd-capital');
    expect(accounts[0].link).toEqual({ kind: 'customer', id: 'halberd-capital' });
  }, SLOW);

  test('idle fleets are present with ≈ 0 tokens and non-zero cost at login', () => {
    const r = explore(login, { range: '24h', groupBy: 'fleet', top: 100 });
    for (const id of login.world.bleeds.idle) {
      const s = r.series.find((x) => x.key === id)!;
      expect(s).toBeDefined();
      // 8 800 slots × $0.25 × 24 h ≈ $52.8k/day, and a trickle of trivial tokens.
      expect(s.total).toBeGreaterThan(50_000);
      expect(s.tokens).toBeLessThan(1e5);
      expect(s.tokens / r.tokens).toBeLessThan(1e-4);
    }
  }, SLOW);

  test('fleetId filters before grouping for every group-by; totals reconcile within the filter', () => {
    const fleetRow = explore(login, { range: '7d', groupBy: 'fleet', top: 100 }).series.find((s) => s.key === 'summarizer-east')!;
    for (const groupBy of GROUPS) {
      const r = explore(login, { range: '7d', groupBy, fleetId: 'summarizer-east', top: 100 });
      expect(Math.abs(r.total - fleetRow.total) / fleetRow.total).toBeLessThan(1e-9);
      expect(Math.abs(r.tokens - fleetRow.tokens) / fleetRow.tokens).toBeLessThan(1e-9);
    }
    const byModel = explore(login, { range: '7d', groupBy: 'model', fleetId: 'summarizer-east' });
    expect(byModel.series.length).toBe(1);
    expect(byModel.series[0].key).toBe('frontier');
    const byWorkload = explore(login, { range: '7d', groupBy: 'workload', fleetId: 'summarizer-east' });
    expect(byWorkload.series.map((s) => s.key).sort()).toEqual(login.world.fleets['summarizer-east'].workloadIds.slice().sort());
    expect(explore(login, { range: '7d', groupBy: 'fleet', fleetId: 'no-such-fleet' })).toMatchObject({ total: 0, tokens: 0, series: [] });
  }, SLOW);

  test('after the trivial → small rule the frontier share collapses in the trailing day', () => {
    const fixed = step(
      applyAction(login, { type: 'routing.set', rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' } }),
      c.HOURS_PER_WEEK,
      DEFAULT_CONFIG,
      createRng(1),
    );
    const before = explore(login, { range: '24h', groupBy: 'model' });
    const after = explore(fixed, { range: '24h', groupBy: 'model' });
    const frontier = (r: typeof before): number => r.series.find((s) => s.key === 'frontier')?.total ?? 0;
    // Bleed A leaves frontier; halberd-monitor and the frontier-bumped healthy fleets stay.
    expect(frontier(after)).toBeLessThan(0.5 * frontier(before));
    expect(frontier(after) / after.total).toBeLessThan(frontier(before) / before.total);
    const east = explore(fixed, { range: '24h', groupBy: 'model', fleetId: 'summarizer-east' });
    expect(east.series.map((s) => s.key)).toEqual(['small']);
  }, SLOW);
});
