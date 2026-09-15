/**
 * World generator contract (plan §3.5, §3.6, §6 T2, §7 T2).
 *
 *   bun test tests/sim/world.test.ts
 *
 * The fixture below is §3.6 inlined so this file never waits on constants.ts.
 */
import { describe, expect, test } from 'bun:test';
import type { ModelDef, Tier, WorkloadDef, WorldDef, WorldParams, WorldPhysics } from '../../src/sim/types';
import { TIER_RANK } from '../../src/sim/types';
import { attemptsMultiplier, jobHoursFor, peakDemandFactor, sizeClassOf } from '../../src/sim/physics';
import { CANONICAL_NOTES, FLEET_NAME_FAMILIES, NOTES, WORKLOAD_TEMPLATES } from '../../src/sim/names';
import { COFOUNDER_TIERING_RULE_ID, generateWorld } from '../../src/sim/world';

// ---------------------------------------------------------------------------
// Fixture (§3.6)
// ---------------------------------------------------------------------------

const TEST_TIERS: Record<Tier, ModelDef> = {
  small: { tier: 'small', name: 'spaghetti-s', priceInPerM: 0.1, priceOutPerM: 0.4, outTokensPerSec: 150, baseErrorRate: 0.005 },
  medium: { tier: 'medium', name: 'spaghetti-m', priceInPerM: 1.0, priceOutPerM: 4.0, outTokensPerSec: 80, baseErrorRate: 0.008 },
  frontier: { tier: 'frontier', name: 'spaghetti-xl', priceInPerM: 10.0, priceOutPerM: 40.0, outTokensPerSec: 35, baseErrorRate: 0.01 },
};

const TEST_PHYSICS: WorldPhysics = {
  prefillTps: 4000,
  overheadS: 0.5,
  diurnalAmplitude: 0.25,
  hoursPerMonth: 730,
  trivialMax: 500,
  standardMax: 4000,
};

const TEST_PARAMS: WorldParams = {
  fleetCount: 40,
  idleFleetCount: 6,
  idleSlotsPerFleet: 8_800,
  idleJobsPerHour: 2,
  bleeds: { tiering: true, retryStorm: true, idle: true },
  bleedA: { jobsPerHour: 5_400_000, inTok: 180, outTok: 40, split: [0.7, 0.3] },
  bleedB: { jobsPerHour: 41_500, inTok: 6_000, outTok: 600, maxAttempts: 5, stormExcess0: 0.5, stormPeakP: 0.61, slotHeadroom: 1.3 },
  healthyTokensPerMonth: 1.2e12,
  healthyTierMix: { small: 0.55, medium: 0.4, frontier: 0.05 },
  healthyOutFraction: 0.2,
  healthySlotsTotal: 5_000,
  provisionHeadroom: 1.3,
  arrTotal: 140e6,
  namedAccounts: [
    { name: 'Halberd Capital', arr: 9.0e6, servedByFamily: 'monitor' },
    { name: 'Meridian Logistics', arr: 3.2e6, servedByFamily: 'relay' },
    { name: 'Northgate Clinics', arr: 2.1e6, servedByFamily: 'relay' },
    { name: 'Tessellate Media', arr: 1.4e6, servedByFamily: 'summarizer' },
  ],
  segments: [
    { id: 'smb', name: 'SMB', accounts: 3_900, arrShare: 0.28 },
    { id: 'mid-market', name: 'Mid-market', accounts: 900, arrShare: 0.34 },
    { id: 'enterprise', name: 'Enterprise', accounts: 120, arrShare: 0.22 },
    { id: 'public-sector', name: 'Public sector', accounts: 60, arrShare: 0.09 },
    { id: 'fintech', name: 'Fintech', accounts: 40, arrShare: 0.07 },
  ],
  homeSegments: { 'summarizer-east': ['smb'], 'halberd-monitor': ['enterprise', 'fintech'] },
};

const world = (seed = 1, params: WorldParams = TEST_PARAMS): WorldDef =>
  generateWorld(seed, params, TEST_TIERS, TEST_PHYSICS);

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Workloads of fleets that are not one of the three bleeds. */
const healthyWorkloads = (w: WorldDef): WorkloadDef[] => {
  const bleedFleets = new Set([w.bleeds.tiering, w.bleeds.retryStorm, ...w.bleeds.idle].filter((x): x is string => x !== null));
  return Object.values(w.workloads).filter((wl) => !bleedFleets.has(wl.fleetId));
};

const RIVERS = new Set(FLEET_NAME_FAMILIES.ingest);
const EMOJI = /\p{Extended_Pictographic}/u;

// ---------------------------------------------------------------------------
// physics.ts
// ---------------------------------------------------------------------------

describe('physics', () => {
  test('jobHoursFor is prefill + decode + overhead, in hours', () => {
    // bleed A on frontier: 180/4000 + 40/35 + 0.5 s = 1.688 s ≈ 0.000469 h (plan §3.6)
    expect(jobHoursFor(180, 40, TEST_TIERS.frontier, 4000, 0.5)).toBeCloseTo(0.000469, 6);
    expect(jobHoursFor(0, 0, TEST_TIERS.small, 4000, 0)).toBe(0);
  });

  test('attemptsMultiplier covers p = 0, p ≥ 1 and the plan’s storm value', () => {
    expect(attemptsMultiplier(0, 5)).toBe(1);
    expect(attemptsMultiplier(1, 5)).toBe(5);
    expect(attemptsMultiplier(1.5, 3)).toBe(3);
    expect(attemptsMultiplier(0.5, 1)).toBe(1);
    expect(attemptsMultiplier(0.61, 5)).toBeCloseTo(2.35, 2); // §3.5 (b)
  });

  test('sizeClassOf and peakDemandFactor', () => {
    expect(sizeClassOf(500, 500, 4000)).toBe('trivial');
    expect(sizeClassOf(501, 500, 4000)).toBe('standard');
    expect(sizeClassOf(4000, 500, 4000)).toBe('standard');
    expect(sizeClassOf(4001, 500, 4000)).toBe('heavy');
    expect(peakDemandFactor(0.25)).toBe(1.25);
  });
});

// ---------------------------------------------------------------------------
// names.ts
// ---------------------------------------------------------------------------

describe('names', () => {
  test('every trivial template has minTier small; every family spans trivial/standard/heavy', () => {
    for (const family of Object.keys(WORKLOAD_TEMPLATES) as (keyof typeof WORKLOAD_TEMPLATES)[]) {
      const templates = WORKLOAD_TEMPLATES[family];
      expect(templates.length).toBeGreaterThanOrEqual(3);
      const classes = new Set(templates.map((t) => sizeClassOf(t.inTokMean + t.outTokMean, TEST_PHYSICS.trivialMax, TEST_PHYSICS.standardMax)));
      expect(classes).toEqual(new Set(['trivial', 'standard', 'heavy']));
      for (const t of templates) {
        if (t.inTokMean + t.outTokMean <= TEST_PHYSICS.trivialMax) expect(t.minTier).toBe('small');
      }
    }
  });

  test('no note anywhere addresses the player or carries an emoji', () => {
    const all = [
      ...NOTES.general, ...NOTES.tiering, ...NOTES.retryStorm, ...NOTES.idle,
      ...Object.values(NOTES.byFamily).flat(),
    ];
    expect(all.length).toBeGreaterThan(10);
    for (const n of all) {
      expect(n.date).toMatch(/^\d{2}-\d{2}$/);
      expect(n.text.toLowerCase()).not.toMatch(/you|operator|player/);
      expect(n.text).not.toMatch(EMOJI);
    }
  });

  test('the last idle note trails off', () => {
    const last = NOTES.idle[NOTES.idle.length - 1].text;
    expect(last).not.toMatch(/[.!?]$/);
  });
});

// ---------------------------------------------------------------------------
// generateWorld — shape
// ---------------------------------------------------------------------------

describe('generateWorld: shape', () => {
  const w = world(1);

  test('40 fleets with unique ids and names, fleetOrder matches fleets', () => {
    expect(w.fleetOrder.length).toBe(40);
    expect(new Set(w.fleetOrder).size).toBe(40);
    expect(new Set(w.fleetOrder.map((id) => w.fleets[id].name)).size).toBe(40);
    expect(Object.keys(w.fleets).sort()).toEqual([...w.fleetOrder].sort());
    for (const id of w.fleetOrder) expect(w.fleets[id].id).toBe(id);
  });

  test('every workload belongs to its fleet, ids unique, sizeClass derived from physics', () => {
    const ids = Object.keys(w.workloads);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of w.fleetOrder) {
      const f = w.fleets[id];
      expect(f.workloadIds.length).toBeGreaterThanOrEqual(1);
      for (const wid of f.workloadIds) {
        const wl = w.workloads[wid];
        expect(wl.fleetId).toBe(id);
        expect(wl.sizeClass).toBe(sizeClassOf(wl.inTokMean + wl.outTokMean, TEST_PHYSICS.trivialMax, TEST_PHYSICS.standardMax));
        expect(wl.jobsPerHour).toBeGreaterThan(0);
      }
    }
    // every workload is reachable from exactly one fleet
    const fromFleets = w.fleetOrder.flatMap((id) => w.fleets[id].workloadIds);
    expect(fromFleets.sort()).toEqual(ids.sort());
  });

  test('healthy fleets carry 2–4 workloads; policies are the plan’s defaults', () => {
    const bleedFleets = new Set([w.bleeds.tiering, w.bleeds.retryStorm, ...w.bleeds.idle]);
    for (const id of w.fleetOrder) {
      const f = w.fleets[id];
      expect(f.initialPolicy.status).toBe('active');
      expect(f.initialPolicy.scaleToZero).toBe(false);
      expect(f.initialPolicy.concurrency).toBe(f.provisionedSlots);
      if (bleedFleets.has(id)) continue;
      expect(f.workloadIds.length).toBeGreaterThanOrEqual(2);
      expect(f.workloadIds.length).toBeLessThanOrEqual(4);
      expect(f.initialPolicy.retry).toEqual({ maxAttempts: 3, backoff: 'exponential', circuitBreaker: true });
      expect(f.initialStormExcess).toBe(0);
      // defaultTier is at least the max minTier of its workloads (never under-tiered by construction)
      const need = Math.max(...f.workloadIds.map((wid) => TIER_RANK[w.workloads[wid].minTier]));
      expect(TIER_RANK[f.defaultTier]).toBeGreaterThanOrEqual(need);
    }
  });

  test('models are the tiers passed in; seed recorded', () => {
    expect(w.models).toBe(TEST_TIERS);
    expect(w.seed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// generateWorld — the three bleeds
// ---------------------------------------------------------------------------

describe('generateWorld: bleeds', () => {
  const w = world(1);

  test('(a) summarizer-east: two trivial small-eval workloads pinned to frontier by the co-founder', () => {
    expect(w.bleeds.tiering).toBe('summarizer-east');
    const f = w.fleets['summarizer-east'];
    expect(f.family).toBe('summarizer');
    expect(f.defaultTier).toBe('frontier');
    expect(f.workloadIds.length).toBe(2);
    const names = f.workloadIds.map((id) => w.workloads[id].name);
    expect(names).toEqual(['ticket-summary', 'ticket-triage']);
    let jobs = 0;
    for (const wid of f.workloadIds) {
      const wl = w.workloads[wid];
      expect(wl.sizeClass).toBe('trivial');
      expect(wl.minTier).toBe('small');
      expect(wl.inTokMean + wl.outTokMean).toBe(220);
      jobs += wl.jobsPerHour;
    }
    expect(jobs).toBeCloseTo(5_400_000, 3);
    expect(w.workloads[f.workloadIds[0]].jobsPerHour / jobs).toBeCloseTo(0.7, 9);

    const rule = w.routing.find((r) => r.id === COFOUNDER_TIERING_RULE_ID);
    expect(rule).toEqual({
      id: 'cf-summarizer-east', priority: 50, match: { fleetId: 'summarizer-east' }, tier: 'frontier', author: 'cofounder', note: 'eval pending',
    });
    expect(w.routing.length).toBe(1);

    // provisioned like a healthy fleet on the frontier model (§3.6: ≈ 4 114 slots)
    const model = TEST_TIERS.frontier;
    const peak = f.workloadIds.reduce(
      (s, wid) => s + w.workloads[wid].jobsPerHour * jobHoursFor(w.workloads[wid].inTokMean, w.workloads[wid].outTokMean, model, TEST_PHYSICS.prefillTps, TEST_PHYSICS.overheadS),
      0,
    ) * peakDemandFactor(TEST_PHYSICS.diurnalAmplitude);
    expect(f.provisionedSlots).toBe(Math.ceil(peak * TEST_PARAMS.provisionHeadroom));
    expect(f.provisionedSlots).toBeGreaterThan(4000);
    expect(f.provisionedSlots).toBeLessThan(4300);
  });

  test('(b) halberd-monitor: one heavy frontier-eval workload, planted storm, demo-era retry policy', () => {
    expect(w.bleeds.retryStorm).toBe('halberd-monitor');
    const f = w.fleets['halberd-monitor'];
    expect(f.family).toBe('monitor');
    expect(f.role).toBe('trading-ops · Halberd Capital');
    expect(f.defaultTier).toBe('frontier');
    expect(f.workloadIds.length).toBe(1);
    const wl = w.workloads[f.workloadIds[0]];
    expect(wl.name).toBe('watch-positions');
    expect(wl.sizeClass).toBe('heavy');
    expect(wl.minTier).toBe('frontier');
    expect(wl.jobsPerHour).toBe(41_500);
    expect(f.initialStormExcess).toBe(0.5);
    expect(f.initialPolicy.retry).toEqual({ maxAttempts: 5, backoff: 'none', circuitBreaker: false });

    // provisioned for the storm at the cap (§3.6: ≈ 840 slots)
    const b = TEST_PARAMS.bleedB;
    const expected = Math.ceil(
      b.jobsPerHour * attemptsMultiplier(b.stormPeakP, b.maxAttempts) *
        jobHoursFor(b.inTok, b.outTok, TEST_TIERS.frontier, TEST_PHYSICS.prefillTps, TEST_PHYSICS.overheadS) *
        peakDemandFactor(TEST_PHYSICS.diurnalAmplitude) * b.slotHeadroom,
    );
    expect(f.provisionedSlots).toBe(expected);
    expect(f.provisionedSlots).toBeGreaterThan(800);
    expect(f.provisionedSlots).toBeLessThan(900);
  });

  test('(c) six idle rivers: one trivial trickle each on an 8 800-slot reservation', () => {
    expect(w.bleeds.idle.length).toBe(6);
    expect(new Set(w.bleeds.idle).size).toBe(6);
    for (const id of w.bleeds.idle) {
      expect(RIVERS.has(id)).toBe(true);
      const f = w.fleets[id];
      expect(f.family).toBe('ingest');
      expect(f.defaultTier).toBe('small');
      expect(f.provisionedSlots).toBe(8_800);
      expect(f.initialPolicy.scaleToZero).toBe(false);
      expect(f.workloadIds.length).toBe(1);
      const wl = w.workloads[f.workloadIds[0]];
      expect(wl.sizeClass).toBe('trivial');
      expect(wl.minTier).toBe('small');
      expect(wl.jobsPerHour).toBe(2);
    }
  });

  test('with every bleed off the world is clean', () => {
    const clean = world(1, { ...TEST_PARAMS, bleeds: { tiering: false, retryStorm: false, idle: false } });
    expect(clean.routing.filter((r) => r.id.startsWith('cf-'))).toEqual([]);
    expect(clean.routing).toEqual([]);
    expect(clean.bleeds).toEqual({ tiering: null, retryStorm: null, idle: [] });
    expect(clean.fleets['summarizer-east'].defaultTier).toBe('small');
    expect(clean.fleets['halberd-monitor'].initialStormExcess).toBe(0);
    expect(clean.fleets['halberd-monitor'].initialPolicy.retry).toEqual({ maxAttempts: 3, backoff: 'exponential', circuitBreaker: true });
    expect(clean.fleetOrder.length).toBe(40);
    for (const id of clean.fleetOrder) {
      if (id === 'summarizer-east' || id === 'halberd-monitor') continue;
      expect(clean.fleets[id].provisionedSlots).not.toBe(8_800);
      expect(clean.fleets[id].workloadIds.length).toBeGreaterThanOrEqual(2);
    }
    const texts = clean.fleetOrder.flatMap((id) => clean.fleets[id].notes.map((n) => n.text));
    expect(texts).not.toContain(CANONICAL_NOTES.tiering);
    expect(texts).not.toContain(CANONICAL_NOTES.retryStorm);
  });
});

// ---------------------------------------------------------------------------
// generateWorld — customers
// ---------------------------------------------------------------------------

describe('generateWorld: customers', () => {
  const w = world(1);

  test('ARR sums to arrTotal; segments split the remainder; named accounts are accounts', () => {
    const total = w.customerOrder.reduce((s, id) => s + w.customers[id].arr, 0);
    expect(Math.abs(total - TEST_PARAMS.arrTotal)).toBeLessThanOrEqual(1);
    expect(Object.keys(w.customers).sort()).toEqual([...w.customerOrder].sort());
    expect(w.customers.smb.kind).toBe('segment');
    expect(w.customers.smb.arr).toBeCloseTo(0.28 * 124.3e6, 0);
    const halberd = w.customers['halberd-capital'];
    expect(halberd.kind).toBe('account');
    expect(halberd.name).toBe('Halberd Capital');
    expect(halberd.arr).toBe(9.0e6);
    expect(halberd.servedBy).toContain('halberd-monitor');
    expect(halberd.servedBy.length).toBe(2);
    for (const id of halberd.servedBy) expect(w.fleets[id].family).toBe('monitor');
    for (const a of TEST_PARAMS.namedAccounts) {
      const c = w.customers[a.name.toLowerCase().replace(/ /g, '-')];
      expect(c.servedBy.some((f) => w.fleets[f].family === a.servedByFamily)).toBe(true);
    }
  });

  test('every fleet has a home segment; pinned homes hold; every segment has ≥ 5 fleets', () => {
    for (const id of w.fleetOrder) {
      expect(w.customerOrder.some((c) => w.customers[c].servedBy.includes(id))).toBe(true);
    }
    expect(w.customers.smb.servedBy).toContain('summarizer-east');
    expect(w.customers.enterprise.servedBy).toContain('halberd-monitor');
    expect(w.customers.fintech.servedBy).toContain('halberd-monitor');
    for (const s of TEST_PARAMS.segments) {
      expect(w.customers[s.id].servedBy.length).toBeGreaterThanOrEqual(5);
      for (const f of w.customers[s.id].servedBy) expect(w.fleetOrder).toContain(f);
    }
  });

  test('customerShares sum to 1 over the customers the fleet serves, weighted by ARR', () => {
    for (const wl of Object.values(w.workloads)) {
      const ids = Object.keys(wl.customerShares);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      const sum = ids.reduce((s, c) => s + wl.customerShares[c], 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
      for (const c of ids) expect(w.customers[c].servedBy).toContain(wl.fleetId);
    }
    // summarizer-east: smb dominates Tessellate Media by ARR
    const se = w.workloads[w.fleets['summarizer-east'].workloadIds[0]].customerShares;
    expect(se.smb).toBeGreaterThan(0.9);
    expect(se['tessellate-media']).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateWorld — healthy line and provisioning
// ---------------------------------------------------------------------------

describe('generateWorld: healthy economy', () => {
  test.each(SEEDS)('seed %i: healthy tokens ≈ target, tier mix ≈ target, out-fraction ≈ target', (seed) => {
    const w = world(seed);
    const healthy = healthyWorkloads(w);
    expect(healthy.length).toBeGreaterThan(40);
    let tokens = 0;
    let out = 0;
    const byTier: Record<Tier, number> = { small: 0, medium: 0, frontier: 0 };
    for (const wl of healthy) {
      const perHour = wl.jobsPerHour * (wl.inTokMean + wl.outTokMean);
      tokens += perHour;
      out += wl.jobsPerHour * wl.outTokMean;
      byTier[w.fleets[wl.fleetId].defaultTier] += perHour;
    }
    const perMonth = tokens * TEST_PHYSICS.hoursPerMonth;
    expect(perMonth / TEST_PARAMS.healthyTokensPerMonth).toBeGreaterThan(0.95);
    expect(perMonth / TEST_PARAMS.healthyTokensPerMonth).toBeLessThan(1.05);
    expect(Math.abs(out / tokens - TEST_PARAMS.healthyOutFraction)).toBeLessThanOrEqual(0.02);
    for (const tier of ['small', 'medium', 'frontier'] as const) {
      expect(Math.abs(byTier[tier] / tokens - TEST_PARAMS.healthyTierMix[tier])).toBeLessThan(0.03);
    }
  });

  test.each(SEEDS)('seed %i: healthy provisioning is ceil(peak × headroom) from physics.ts', (seed) => {
    const w = world(seed);
    const bleedFleets = new Set([w.bleeds.tiering, w.bleeds.retryStorm, ...w.bleeds.idle]);
    let checked = 0;
    for (const id of w.fleetOrder) {
      if (bleedFleets.has(id)) continue;
      const f = w.fleets[id];
      const model = TEST_TIERS[f.defaultTier];
      let peak = 0;
      for (const wid of f.workloadIds) {
        const wl = w.workloads[wid];
        peak += wl.jobsPerHour * jobHoursFor(wl.inTokMean, wl.outTokMean, model, TEST_PHYSICS.prefillTps, TEST_PHYSICS.overheadS);
      }
      peak *= peakDemandFactor(TEST_PHYSICS.diurnalAmplitude);
      expect(f.provisionedSlots).toBe(Math.ceil(peak * TEST_PARAMS.provisionHeadroom));
      expect(f.provisionedSlots).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBe(40 - 2 - 6);
  });

  test('a seed-chosen few healthy fleets run frontier without needing it', () => {
    const w = world(1);
    const bumped = w.fleetOrder.filter((id) => {
      const f = w.fleets[id];
      return id !== 'summarizer-east' && id !== 'halberd-monitor' && f.defaultTier === 'frontier';
    });
    expect(bumped.length).toBeGreaterThanOrEqual(1);
    expect(bumped.length).toBeLessThanOrEqual(3);
    for (const id of bumped) {
      for (const wid of w.fleets[id].workloadIds) expect(w.workloads[wid].minTier).not.toBe('frontier');
    }
  });
});

// ---------------------------------------------------------------------------
// generateWorld — determinism
// ---------------------------------------------------------------------------

describe('generateWorld: determinism', () => {
  test('same seed → deep-equal; the input params are not mutated', () => {
    const frozen = structuredClone(TEST_PARAMS);
    const a = generateWorld(7, frozen, TEST_TIERS, TEST_PHYSICS);
    const b = generateWorld(7, frozen, TEST_TIERS, TEST_PHYSICS);
    expect(a).toEqual(b);
    expect(frozen).toEqual(TEST_PARAMS);
  });

  test('different seeds → different idle rivers and different worlds', () => {
    const a = world(1);
    const b = world(2);
    expect([...a.bleeds.idle].sort()).not.toEqual([...b.bleeds.idle].sort());
    expect(a).not.toEqual(b);
    // the fixed identities survive every seed
    for (const seed of SEEDS) {
      const w = world(seed);
      expect(w.bleeds.tiering).toBe('summarizer-east');
      expect(w.bleeds.retryStorm).toBe('halberd-monitor');
      expect(w.bleeds.idle.length).toBe(6);
      expect(w.fleetOrder.length).toBe(40);
      expect(w.fleetOrder).toContain('comms-relay');
      expect(w.fleetOrder).toContain('secondary-runner');
      expect(w.fleetOrder).toContain('summarizer-west');
    }
  });
});

// ---------------------------------------------------------------------------
// generateWorld — the co-founder's notes
// ---------------------------------------------------------------------------

describe('generateWorld: notes', () => {
  test.each(SEEDS)('seed %i: ≥ 30 fleets carry notes; canonical lines verbatim; nobody is addressed', (seed) => {
    const w = world(seed);
    const withNotes = w.fleetOrder.filter((id) => w.fleets[id].notes.length > 0);
    expect(withNotes.length).toBeGreaterThanOrEqual(30);
    const all = w.fleetOrder.flatMap((id) => w.fleets[id].notes);
    for (const n of all) {
      expect(n.date).toMatch(/^\d{2}-\d{2}$/);
      expect(n.text.toLowerCase()).not.toMatch(/you|operator|player/);
      expect(n.text).not.toMatch(EMOJI);
    }
    const texts = all.map((n) => n.text);
    expect(texts).toContain(CANONICAL_NOTES.tiering);
    expect(texts).toContain(CANONICAL_NOTES.retryStorm);
    expect(texts).toContain(CANONICAL_NOTES.ingest);
    expect(w.fleets['summarizer-east'].notes.map((n) => n.text)).toContain(CANONICAL_NOTES.tiering);
    expect(w.fleets['halberd-monitor'].notes.map((n) => n.text)).toContain(CANONICAL_NOTES.retryStorm);
    // every idle river carries one of the idle notes, and the trailing one appears
    const idleTexts = new Set(NOTES.idle.map((n) => n.text));
    for (const id of w.bleeds.idle) expect(w.fleets[id].notes.some((n) => idleTexts.has(n.text))).toBe(true);
    expect(texts).toContain(NOTES.idle[NOTES.idle.length - 1].text);
    // no fleet repeats a note
    for (const id of w.fleetOrder) {
      const t = w.fleets[id].notes.map((n) => n.text);
      expect(new Set(t).size).toBe(t.length);
    }
  });
});
