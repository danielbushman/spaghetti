/**
 * World generator. Plan §3.5, §3.6, §7 T2.
 *
 * `generateWorld(seed, params, tiers, physics)` builds the fleets, workloads,
 * customers and the co-founder's routing rules for one run. Pure and
 * deterministic: every draw comes from `createRng(seed).fork('world')`, and
 * every collection is walked in a fixed order (never unsorted object keys).
 *
 * Every physical number (prefill rate, overhead, diurnal amplitude, hours
 * per month, size-class bounds) comes from `physics`, so the capacity this
 * provisions is the capacity `step.ts` will charge for.
 */
import type {
  CoFounderNote,
  CustomerDef,
  FleetDef,
  FleetFamily,
  FleetPolicy,
  ModelDef,
  RetryPolicy,
  RoutingRule,
  Tier,
  WorkloadDef,
  WorldDef,
  WorldParams,
  WorldPhysics,
} from './types';
import { TIER_RANK } from './types';
import { createRng, type HourRng } from './rng';
import {
  BLEED_A_WORKLOAD_NAMES,
  BLEED_B_WORKLOAD_NAME,
  FAMILY_ORDER,
  FIXED_FLEET_NAMES,
  FLEET_NAME_FAMILIES,
  HALBERD_ROLE,
  IDLE_WORKLOAD_TEMPLATE,
  NOTES,
  ROLE_BY_FAMILY,
  WORKLOAD_TEMPLATES,
  type WorkloadTemplate,
} from './names';
import { attemptsMultiplier, jobHoursFor, peakDemandFactor, sizeClassOf } from './physics';

// ---------------------------------------------------------------------------
// Fixed identities
// ---------------------------------------------------------------------------

/** Bleed (a): the tiering fleet. */
export const TIERING_FLEET_ID = 'summarizer-east';
/** Bleed (b): the retry-storm fleet. */
export const STORM_FLEET_ID = 'halberd-monitor';
/** The co-founder's rule that pins the tiering fleet to frontier. */
export const COFOUNDER_TIERING_RULE_ID = 'cf-summarizer-east';
export const COFOUNDER_TIERING_RULE_PRIORITY = 50;

/** Retry policy for every fleet except the storm fleet (plan §7 T2 step 5). */
export const HEALTHY_RETRY: RetryPolicy = { maxAttempts: 3, backoff: 'exponential', circuitBreaker: true };

/** Share of healthy fleets bumped to frontier without needing it (step 4). */
export const FRONTIER_BUMP_SHARE = 0.05;
/** Share of fleets that get no general/family note at all (step 7: "0–2"). */
export const NOTELESS_SHARE = 1 / 8;
/** Per-fleet size spread (log-normal σ) before bucket scaling. */
const FLEET_SIZE_SIGMA = 0.4;
/** Healthy fleets carry 2–4 workloads. */
const MIN_WORKLOADS = 2;
const MAX_WORKLOADS = 4;
/** Two tiers healthy fleets are graded into before the frontier bump. */
const HEALTHY_GRADES: readonly Tier[] = ['small', 'medium'];
const TIERS_IN_RANK: readonly Tier[] = ['small', 'medium', 'frontier'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function workloadId(fleetId: string, name: string): string {
  return `${fleetId}/${name}`;
}

export function customerIdOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function maxTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** Peak slot demand of a workload list on `model`: Σ jobs × jobHours × peak factor. */
export function peakSlotsFor(
  workloads: readonly { jobsPerHour: number; inTokMean: number; outTokMean: number }[],
  model: ModelDef,
  physics: WorldPhysics,
): number {
  let slots = 0;
  for (const w of workloads) {
    slots += w.jobsPerHour * jobHoursFor(w.inTokMean, w.outTokMean, model, physics.prefillTps, physics.overheadS);
  }
  return slots * peakDemandFactor(physics.diurnalAmplitude);
}

/** Healthy provisioning: ceil(peak slots × headroom) (plan §7 T2 step 4). */
export function provisionedSlotsFor(
  workloads: readonly { jobsPerHour: number; inTokMean: number; outTokMean: number }[],
  model: ModelDef,
  physics: WorldPhysics,
  headroom: number,
): number {
  return Math.ceil(peakSlotsFor(workloads, model, physics) * headroom);
}

/**
 * Storm provisioning (plan §7 T2 step 3): headroom over the storm load *at
 * the cap*, so the storm is a token bleed, never a backlog. `stormPeakP` is a
 * parameter so the generator never re-derives the storm dynamics.
 */
export function stormSlotsFor(
  bleedB: WorldParams['bleedB'],
  model: ModelDef,
  physics: WorldPhysics,
): number {
  const perJob = jobHoursFor(bleedB.inTok, bleedB.outTok, model, physics.prefillTps, physics.overheadS);
  const attempts = attemptsMultiplier(bleedB.stormPeakP, bleedB.maxAttempts);
  return Math.ceil(
    bleedB.jobsPerHour * attempts * perJob * peakDemandFactor(physics.diurnalAmplitude) * bleedB.slotHeadroom,
  );
}

function activePolicy(concurrency: number, retry: RetryPolicy): FleetPolicy {
  return { status: 'active', concurrency, scaleToZero: false, retry: { ...retry } };
}

/**
 * Allocate `fleetCount` fleets across families in proportion to pool size
 * (largest remainder), then enforce the floors: each family keeps its fixed
 * names, ingest keeps enough rivers for the idle set, nothing exceeds its
 * pool. Deterministic; no RNG.
 */
export function allocateFamilies(fleetCount: number, idleFleetCount: number): Record<FleetFamily, number> {
  const pool = (f: FleetFamily): number => FLEET_NAME_FAMILIES[f].length;
  const fixed = (f: FleetFamily): number => FLEET_NAME_FAMILIES[f].filter((n) => FIXED_FLEET_NAMES.includes(n)).length;
  const floor = (f: FleetFamily): number => Math.max(fixed(f), f === 'ingest' ? idleFleetCount : 0);

  const poolTotal = FAMILY_ORDER.reduce((s, f) => s + pool(f), 0);
  if (fleetCount > poolTotal) throw new Error(`fleetCount ${fleetCount} exceeds the ${poolTotal} names available`);
  if (fleetCount < FAMILY_ORDER.reduce((s, f) => s + floor(f), 0)) {
    throw new Error(`fleetCount ${fleetCount} is below the fixed-name floor`);
  }

  // Largest-remainder apportionment.
  const counts = {} as Record<FleetFamily, number>;
  const remainders: { f: FleetFamily; r: number }[] = [];
  let assigned = 0;
  for (const f of FAMILY_ORDER) {
    const exact = (fleetCount * pool(f)) / poolTotal;
    counts[f] = Math.floor(exact);
    assigned += counts[f];
    remainders.push({ f, r: exact - counts[f] });
  }
  remainders.sort((a, b) => b.r - a.r || FAMILY_ORDER.indexOf(a.f) - FAMILY_ORDER.indexOf(b.f));
  for (let i = 0; assigned < fleetCount; i++) {
    counts[remainders[i % remainders.length].f] += 1;
    assigned += 1;
  }

  // Floors and caps: move fleets from the family with the most slack.
  const slack = (f: FleetFamily): number => counts[f] - floor(f);
  for (const f of FAMILY_ORDER) {
    while (counts[f] < floor(f)) {
      const donor = FAMILY_ORDER.filter((g) => g !== f && slack(g) > 0).sort((a, b) => slack(b) - slack(a))[0];
      if (!donor) throw new Error('cannot satisfy family floors');
      counts[donor] -= 1;
      counts[f] += 1;
    }
    while (counts[f] > pool(f)) {
      const taker = FAMILY_ORDER.filter((g) => g !== f && counts[g] < pool(g)).sort((a, b) => pool(b) - counts[b] - (pool(a) - counts[a]))[0];
      if (!taker) throw new Error('cannot satisfy family caps');
      counts[f] -= 1;
      counts[taker] += 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/** A workload before its jobs/h is pinned by the healthy scaling pass. */
interface Draft {
  fleetId: string;
  template: WorkloadTemplate;
  /** Relative demand: template share × fleet size. */
  baseJobs: number;
}

export function generateWorld(
  seed: number,
  params: WorldParams,
  tiers: Record<Tier, ModelDef>,
  physics: WorldPhysics,
): WorldDef {
  const rng = createRng(seed).fork('world');
  const { bleeds } = params;

  // ---- (1) fleets: names, families, the idle set ---------------------------
  const counts = allocateFamilies(params.fleetCount, bleeds.idle ? params.idleFleetCount : 0);
  const fleetOrder: string[] = [];
  const familyOf: Record<string, FleetFamily> = {};
  for (const family of FAMILY_ORDER) {
    const pool = FLEET_NAME_FAMILIES[family];
    const fixed = pool.filter((n) => FIXED_FLEET_NAMES.includes(n));
    const rest = rng.shuffle(pool.filter((n) => !FIXED_FLEET_NAMES.includes(n)));
    const names = fixed.concat(rest.slice(0, counts[family] - fixed.length));
    for (const n of names) {
      fleetOrder.push(n);
      familyOf[n] = family;
    }
  }
  const ingestIds = fleetOrder.filter((id) => familyOf[id] === 'ingest');
  const idleIds = bleeds.idle ? rng.shuffle(ingestIds).slice(0, params.idleFleetCount) : [];
  const idleSet = new Set(idleIds);
  const tieringOn = bleeds.tiering && fleetOrder.includes(TIERING_FLEET_ID);
  const stormOn = bleeds.retryStorm && fleetOrder.includes(STORM_FLEET_ID);
  const isHealthy = (id: string): boolean => id !== TIERING_FLEET_ID && id !== STORM_FLEET_ID && !idleSet.has(id);

  // ---- (2)–(4) workloads ---------------------------------------------------
  const workloads: Record<string, WorkloadDef> = {};
  const workloadOrder: string[] = [];
  const defaultTier: Record<string, Tier> = {};
  const drafts: Draft[] = [];

  const addWorkload = (fleetId: string, t: WorkloadTemplate, jobsPerHour: number): WorkloadDef => {
    const id = workloadId(fleetId, t.name);
    const w: WorkloadDef = {
      id,
      name: t.name,
      fleetId,
      jobsPerHour,
      inTokMean: t.inTokMean,
      outTokMean: t.outTokMean,
      sizeClass: sizeClassOf(t.inTokMean + t.outTokMean, physics.trivialMax, physics.standardMax),
      minTier: t.minTier,
      businessHours: t.businessHours,
      customerShares: {}, // filled in step 6
    };
    workloads[id] = w;
    workloadOrder.push(id);
    return w;
  };

  for (const fleetId of fleetOrder) {
    const family = familyOf[fleetId];
    if (fleetId === TIERING_FLEET_ID) {
      // Bleed (a): two trivial workloads, jobs split by bleedA.split.
      const { bleedA } = params;
      BLEED_A_WORKLOAD_NAMES.forEach((name, i) => {
        const share = bleedA.split[i] ?? 0;
        addWorkload(
          fleetId,
          { name, inTokMean: bleedA.inTok, outTokMean: bleedA.outTok, minTier: 'small', businessHours: false, share },
          bleedA.jobsPerHour * share,
        );
      });
      defaultTier[fleetId] = tieringOn ? 'frontier' : 'small';
      continue;
    }
    if (fleetId === STORM_FLEET_ID) {
      // Bleed (b): one heavy workload that honestly needs the frontier model.
      const { bleedB } = params;
      addWorkload(
        fleetId,
        { name: BLEED_B_WORKLOAD_NAME, inTokMean: bleedB.inTok, outTokMean: bleedB.outTok, minTier: 'frontier', businessHours: false, share: 1 },
        bleedB.jobsPerHour,
      );
      defaultTier[fleetId] = 'frontier';
      continue;
    }
    if (idleSet.has(fleetId)) {
      // Bleed (c): a trickle of trivial work on a river-sized reservation.
      addWorkload(fleetId, IDLE_WORKLOAD_TEMPLATE, params.idleJobsPerHour);
      defaultTier[fleetId] = 'small';
      continue;
    }
    // Healthy: grade the fleet, pick 2–4 templates it is allowed to run, and
    // force one template of exactly the grade so defaultTier = grade.
    const grade = HEALTHY_GRADES[rng.int(HEALTHY_GRADES.length)];
    const allowed = WORKLOAD_TEMPLATES[family].filter((t) => TIER_RANK[t.minTier] <= TIER_RANK[grade]);
    const count = Math.min(allowed.length, MIN_WORKLOADS + rng.int(MAX_WORKLOADS - MIN_WORKLOADS + 1));
    let picked = rng.shuffle(allowed).slice(0, count);
    if (!picked.some((t) => t.minTier === grade)) {
      const ofGrade = allowed.filter((t) => t.minTier === grade);
      if (ofGrade.length > 0) picked = picked.slice(0, count - 1).concat([rng.pick(ofGrade)]);
    }
    picked = WORKLOAD_TEMPLATES[family].filter((t) => picked.includes(t)); // template order, not shuffle order
    const size = rng.lognormal(FLEET_SIZE_SIGMA);
    let tier: Tier = 'small';
    for (const t of picked) {
      addWorkload(fleetId, t, 0); // jobs/h pinned below
      drafts.push({ fleetId, template: t, baseJobs: t.share * size });
      tier = maxTier(tier, t.minTier);
    }
    defaultTier[fleetId] = tier;
  }

  // Seed-chosen 5% of healthy fleets run frontier without needing it.
  const healthyIds = fleetOrder.filter(isHealthy);
  const bumpCount = healthyIds.length > 0 ? Math.max(1, Math.round(healthyIds.length * FRONTIER_BUMP_SHARE)) : 0;
  for (const id of rng.shuffle(healthyIds).slice(0, bumpCount)) defaultTier[id] = 'frontier';

  // Healthy scaling: per tier bucket (the tier the fleet runs at), pin
  // Σ tokens/h to healthyTokensPerMonth × mix / hoursPerMonth and, where the
  // bucket has templates on both sides of the target, pin
  // Σ out / Σ (in + out) to healthyOutFraction by re-weighting the lean and
  // rich halves (two constraints, two scale factors).
  scaleHealthy(drafts, defaultTier, params, physics.hoursPerMonth, workloads);

  // ---- (3)–(5) fleets: provisioning, policies ------------------------------
  const fleets: Record<string, FleetDef> = {};
  for (const fleetId of fleetOrder) {
    const family = familyOf[fleetId];
    const ids = workloadOrder.filter((id) => workloads[id].fleetId === fleetId);
    const ws = ids.map((id) => workloads[id]);
    const model = tiers[defaultTier[fleetId]];

    let provisionedSlots: number;
    let retry: RetryPolicy = HEALTHY_RETRY;
    let initialStormExcess = 0;
    if (fleetId === STORM_FLEET_ID) {
      provisionedSlots = stormSlotsFor(params.bleedB, model, physics);
      if (stormOn) {
        initialStormExcess = params.bleedB.stormExcess0;
        retry = { maxAttempts: params.bleedB.maxAttempts, backoff: 'none', circuitBreaker: false };
      }
    } else if (idleSet.has(fleetId)) {
      provisionedSlots = params.idleSlotsPerFleet;
    } else {
      provisionedSlots = provisionedSlotsFor(ws, model, physics, params.provisionHeadroom);
    }

    fleets[fleetId] = {
      id: fleetId,
      name: fleetId,
      family,
      role: fleetId === STORM_FLEET_ID ? HALBERD_ROLE : ROLE_BY_FAMILY[family],
      defaultTier: defaultTier[fleetId],
      provisionedSlots,
      workloadIds: ids,
      notes: [], // step 7
      initialPolicy: activePolicy(provisionedSlots, retry),
      initialStormExcess,
    };
  }

  // ---- (6) customers ------------------------------------------------------
  const { customers, customerOrder } = buildCustomers(rng, params, fleetOrder, familyOf);
  for (const id of workloadOrder) {
    const w = workloads[id];
    const serving = customerOrder.filter((c) => customers[c].servedBy.includes(w.fleetId));
    const total = serving.reduce((s, c) => s + customers[c].arr, 0);
    const shares: Record<string, number> = {};
    for (const c of serving) shares[c] = total > 0 ? customers[c].arr / total : 1 / serving.length;
    w.customerShares = shares;
  }

  // ---- (7) notes ------------------------------------------------------------
  assignNotes(rng, params, fleets, fleetOrder, familyOf, { tieringOn, stormOn, idleIds, isHealthy });

  // ---- routing --------------------------------------------------------------
  const routing: RoutingRule[] = [];
  if (tieringOn) {
    routing.push({
      id: COFOUNDER_TIERING_RULE_ID,
      priority: COFOUNDER_TIERING_RULE_PRIORITY,
      match: { fleetId: TIERING_FLEET_ID },
      tier: 'frontier',
      author: 'cofounder',
      note: 'eval pending',
    });
  }

  return {
    seed,
    models: tiers,
    fleets,
    fleetOrder,
    workloads,
    customers,
    customerOrder,
    routing,
    bleeds: {
      tiering: tieringOn ? TIERING_FLEET_ID : null,
      retryStorm: stormOn ? STORM_FLEET_ID : null,
      idle: idleIds,
    },
  };
}

// ---------------------------------------------------------------------------
// Healthy scaling (step 4)
// ---------------------------------------------------------------------------

function scaleHealthy(
  drafts: Draft[],
  defaultTier: Record<string, Tier>,
  params: WorldParams,
  hoursPerMonth: number,
  workloads: Record<string, WorkloadDef>,
): void {
  const target = params.healthyOutFraction;
  const tokensOf = (d: Draft): number => d.baseJobs * (d.template.inTokMean + d.template.outTokMean);
  const outOf = (d: Draft): number => d.baseJobs * d.template.outTokMean;

  for (const tier of TIERS_IN_RANK) {
    const bucket = drafts.filter((d) => defaultTier[d.fleetId] === tier);
    if (bucket.length === 0) continue;
    // Tokens per hour this bucket must carry.
    const budget = (params.healthyTokensPerMonth * params.healthyTierMix[tier]) / hoursPerMonth;

    const lean = bucket.filter((d) => d.template.outTokMean / (d.template.inTokMean + d.template.outTokMean) <= target);
    const rich = bucket.filter((d) => !lean.includes(d));
    const leanTok = lean.reduce((s, d) => s + tokensOf(d), 0);
    const richTok = rich.reduce((s, d) => s + tokensOf(d), 0);
    const fL = leanTok > 0 ? lean.reduce((s, d) => s + outOf(d), 0) / leanTok : NaN;
    const fR = richTok > 0 ? rich.reduce((s, d) => s + outOf(d), 0) / richTok : NaN;

    let leanScale: number;
    let richScale: number;
    if (leanTok > 0 && richTok > 0 && fL < target && target < fR) {
      // Mix lean and rich tokens so the bucket lands on the target fraction:
      //   x·fL + (B − x)·fR = target·B  ⇒  x = B (fR − target) / (fR − fL)
      const leanTarget = (budget * (fR - target)) / (fR - fL);
      leanScale = leanTarget / leanTok;
      richScale = (budget - leanTarget) / richTok;
    } else {
      // One-sided bucket: pin tokens only.
      leanScale = richScale = budget / (leanTok + richTok);
    }

    for (const d of bucket) {
      const scale = lean.includes(d) ? leanScale : richScale;
      workloads[workloadId(d.fleetId, d.template.name)].jobsPerHour = Math.max(1, Math.round(d.baseJobs * scale));
    }
  }
}

// ---------------------------------------------------------------------------
// Customers (step 6)
// ---------------------------------------------------------------------------

function buildCustomers(
  rng: HourRng,
  params: WorldParams,
  fleetOrder: string[],
  familyOf: Record<string, FleetFamily>,
): { customers: Record<string, CustomerDef>; customerOrder: string[] } {
  const customers: Record<string, CustomerDef> = {};
  const customerOrder: string[] = [];

  // Segments share the ARR left after the named accounts.
  const namedArr = params.namedAccounts.reduce((s, a) => s + a.arr, 0);
  const segmentArr = params.arrTotal - namedArr;
  for (const s of params.segments) {
    customers[s.id] = { id: s.id, name: s.name, kind: 'segment', accounts: s.accounts, arr: s.arrShare * segmentArr, servedBy: [] };
    customerOrder.push(s.id);
  }

  // Home segments: pinned first, then every other fleet spread round-robin
  // over a seed-shuffled order so each segment gets its fair share.
  const home: Record<string, string[]> = {};
  const pinned = new Set<string>();
  for (const fleetId of fleetOrder) {
    const homes = (params.homeSegments[fleetId] ?? []).filter((s) => s in customers);
    if (homes.length > 0) {
      home[fleetId] = homes;
      pinned.add(fleetId);
    }
  }
  const spread = rng.shuffle(fleetOrder.filter((id) => !pinned.has(id)));
  spread.forEach((fleetId, i) => {
    home[fleetId] = [params.segments[i % params.segments.length].id];
  });
  for (const fleetId of fleetOrder) {
    for (const s of home[fleetId] ?? []) customers[s].servedBy.push(fleetId);
  }

  // Named accounts: the fleet named for them (if any) plus one fleet of the family.
  for (const a of params.namedAccounts) {
    const id = customerIdOf(a.name);
    const firstWord = customerIdOf(a.name).split('-')[0];
    const servedBy: string[] = [];
    const namesake = fleetOrder.find((f) => f === firstWord || f.startsWith(`${firstWord}-`));
    if (namesake) servedBy.push(namesake);
    const ofFamily = fleetOrder.find((f) => familyOf[f] === a.servedByFamily && !servedBy.includes(f));
    if (ofFamily) servedBy.push(ofFamily);
    customers[id] = { id, name: a.name, kind: 'account', accounts: 1, arr: a.arr, servedBy };
    customerOrder.push(id);
  }

  return { customers, customerOrder };
}

// ---------------------------------------------------------------------------
// Notes (step 7)
// ---------------------------------------------------------------------------

function assignNotes(
  rng: HourRng,
  params: WorldParams,
  fleets: Record<string, FleetDef>,
  fleetOrder: string[],
  familyOf: Record<string, FleetFamily>,
  ctx: { tieringOn: boolean; stormOn: boolean; idleIds: string[]; isHealthy: (id: string) => boolean },
): void {
  // A seed-chosen eighth of the fleets get no general/family note.
  const noteless = new Set(rng.shuffle(fleetOrder.filter(ctx.isHealthy)).slice(0, Math.floor(params.fleetCount * NOTELESS_SHARE)));
  const firstOfFamily = new Set<string>();
  const seen = new Set<FleetFamily>();
  for (const id of fleetOrder) {
    if (!seen.has(familyOf[id])) {
      seen.add(familyOf[id]);
      firstOfFamily.add(id);
    }
  }

  for (const fleetId of fleetOrder) {
    const family = familyOf[fleetId];
    const notes: CoFounderNote[] = [];

    // The bleed fleets carry their specific notes.
    if (fleetId === TIERING_FLEET_ID && ctx.tieringOn) notes.push(...NOTES.tiering);
    if (fleetId === STORM_FLEET_ID && ctx.stormOn) notes.push(...NOTES.retryStorm);
    const idleIndex = ctx.idleIds.indexOf(fleetId);
    if (idleIndex >= 0) notes.push(NOTES.idle[idleIndex % NOTES.idle.length]);

    // The family's first note is pinned to its first fleet (the naming note).
    const familyNotes = NOTES.byFamily[family];
    if (firstOfFamily.has(fleetId) && familyNotes.length > 0) notes.push(familyNotes[0]);

    // 0–2 general/family notes, seed-chosen.
    if (!noteless.has(fleetId)) {
      const pool = familyNotes.slice(firstOfFamily.has(fleetId) ? 1 : 0).concat(NOTES.general);
      const count = 1 + rng.int(2);
      notes.push(...rng.shuffle(pool).slice(0, count));
    }

    notes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    fleets[fleetId].notes = notes.map((n) => ({ ...n }));
  }
}
