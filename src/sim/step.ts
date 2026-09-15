/**
 * The tick. Plan §3.4 (T3).
 *
 * `step(state, dtHours, config, rng)` loops `tickHour`, which walks every
 * fleet in `fleetOrder` and every workload in `workloadIds`, drawing exactly
 * one jitter per workload per hour from `rng.forHour(t)`. It returns a new
 * state and never mutates its input (structural sharing is allowed).
 *
 * No numeric literal in this file other than 0, 1, 2, 24, 100, 1e6 and 3600;
 * every other number is a `Constants` key, so tuning never touches the math.
 */
import type {
  Constants,
  DaySample,
  FleetDef,
  FleetRuntime,
  HourSample,
  RoutingRule,
  SimConfig,
  SimState,
  Tier,
  WorkloadDef,
  WorkloadHour,
  WorldDef,
} from './types';
import { TIER_RANK } from './types';
import type { HourRng, Rng } from './rng';
import { PRELUDE_HOURS } from './time';
import { attemptsMultiplier, jobHoursFor } from './physics';

const TOKENS_PER_PRICE_UNIT = 1e6;
const HOURS_PER_DAY = 24;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

// ---------------------------------------------------------------------------
// Step 1 — demand shape
// ---------------------------------------------------------------------------

/**
 * Diurnal × weekend demand shape for sim-hour `t` (mean 1 over a week for
 * always-on work): (1 + A·sin(2π(hourOfDay − peak)/24)) × weekend factor.
 */
export function demandFactor(t: number, businessHours: boolean, c: Constants): number {
  const hourOfDay = t % HOURS_PER_DAY;
  const dayOfWeek = Math.floor(t / HOURS_PER_DAY) % c.DAYS_PER_WEEK;
  const diurnal = 1 + c.DIURNAL_AMPLITUDE * Math.sin((2 * Math.PI * (hourOfDay - c.DIURNAL_PEAK_HOUR)) / HOURS_PER_DAY);
  const weekend = businessHours && dayOfWeek >= c.WEEKEND_START_DAY ? c.WEEKEND_FACTOR : 1;
  return diurnal * weekend;
}

/**
 * Arrivals per workload for sim-hour `t`, drawn in the tick's order (one
 * lognormal jitter per workload). Exposed so tests can bound `queue'`.
 */
export function hourArrivals(world: WorldDef, t: number, c: Constants, hourRng: HourRng): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fleetId of world.fleetOrder) {
    for (const wid of world.fleets[fleetId].workloadIds) {
      const w = world.workloads[wid];
      out[wid] = w.jobsPerHour * demandFactor(t, w.businessHours, c) * hourRng.lognormal(c.JITTER_SIGMA);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2 — routing
// ---------------------------------------------------------------------------

function ruleMatches(rule: RoutingRule, fleetId: string, w: WorkloadDef): boolean {
  const m = rule.match;
  if (m.fleetId !== undefined && m.fleetId !== fleetId) return false;
  if (m.workloadId !== undefined && m.workloadId !== w.id) return false;
  if (m.sizeClass !== undefined && m.sizeClass !== w.sizeClass) return false;
  return true;
}

/**
 * Among rules whose every present match field fits the workload, the lowest
 * `priority` wins (ties by id); no rule → `fallback`.
 */
export function resolveTier(
  routing: readonly RoutingRule[],
  fleetId: string,
  w: WorkloadDef,
  fallback: Tier,
): { tier: Tier; ruleId: string | null } {
  let best: RoutingRule | null = null;
  for (const rule of routing) {
    if (!ruleMatches(rule, fleetId, w)) continue;
    if (best === null || rule.priority < best.priority || (rule.priority === best.priority && rule.id < best.id)) {
      best = rule;
    }
  }
  return best ? { tier: best.tier, ruleId: best.id } : { tier: fallback, ruleId: null };
}

// ---------------------------------------------------------------------------
// The hour
// ---------------------------------------------------------------------------

interface FleetHourResult {
  runtime: FleetRuntime;
  tokenCost: number;
  tokens: number;
  capacityCost: number;
}

/** Steps 3–9 for one fleet. Pure over the fleet's previous runtime; writes its hour into `byWorkload`. */
function tickFleet(
  fleet: FleetDef,
  prev: FleetRuntime,
  arrivals: Record<string, number>,
  state: SimState,
  c: Constants,
  byWorkload: Record<string, WorkloadHour>,
): FleetHourResult {
  const world = state.world;
  const policy = prev.policy;
  const paused = policy.status === 'paused';
  const ids = fleet.workloadIds;
  const n = ids.length;

  // Step 4 — storm dynamics: retries feed the storm, shedding drains it.
  const recovery = prev.breakerOpen
    ? c.BREAKER_RECOVERY_PER_HOUR
    : policy.retry.backoff === 'exponential'
      ? c.BACKOFF_RECOVERY_PER_HOUR
      : c.NATURAL_RECOVERY_PER_HOUR;
  const stormExcess = clamp(prev.stormExcess + c.STORM_GAIN * (prev.attemptsPerJob - 1) - recovery, 0, c.STORM_EXCESS_CAP);

  // Arrivals; the fleet queue is apportioned to workloads by arrival share.
  const a = new Array<number>(n);
  let sumA = 0;
  for (let i = 0; i < n; i++) {
    a[i] = arrivals[ids[i]];
    sumA += a[i];
  }

  // Steps 2–3 — tier and per-attempt error rate per workload; demand = a + queue share.
  const tiers = new Array<Tier>(n);
  const p = new Array<number>(n);
  const jobHours = new Array<number>(n);
  const demand = new Array<number>(n);
  let sumDemand = 0;
  let demandP = 0;
  for (let i = 0; i < n; i++) {
    const w = world.workloads[ids[i]];
    const { tier } = resolveTier(state.routing, fleet.id, w, fleet.defaultTier);
    const model = world.models[tier];
    const underTier = TIER_RANK[tier] < TIER_RANK[w.minTier] ? c.UNDER_TIER_ERROR_PENALTY : 0;
    tiers[i] = tier;
    p[i] = clamp(model.baseErrorRate + underTier + stormExcess, 0, c.MAX_ERROR_RATE);
    jobHours[i] = jobHoursFor(w.inTokMean, w.outTokMean, model, c.PREFILL_TPS, c.JOB_OVERHEAD_S);
    const q = sumA > 0 ? (prev.queueDepth * a[i]) / sumA : n > 0 ? prev.queueDepth / n : 0;
    demand[i] = a[i] + q;
    sumDemand += demand[i];
    demandP += demand[i] * p[i];
  }

  // Step 5 — circuit breaker with hysteresis on the demand-weighted error rate.
  const fleetP = sumDemand > 0 ? demandP / sumDemand : 0;
  const breakerOpen = policy.retry.circuitBreaker && (prev.breakerOpen ? fleetP > c.BREAKER_RESET : fleetP > c.BREAKER_TRIP);
  const maxAttempts = breakerOpen ? 1 : policy.retry.maxAttempts;

  // Step 6 — expected attempts per processed job; step 7 — slots the hour's arrivals need.
  const m = new Array<number>(n);
  let slotsNeeded = 0;
  let slotHoursPerJob = 0; // at this hour's demand mix
  for (let i = 0; i < n; i++) {
    m[i] = attemptsMultiplier(p[i], maxAttempts);
    slotsNeeded += a[i] * m[i] * jobHours[i];
    if (sumDemand > 0) slotHoursPerJob += (demand[i] / sumDemand) * m[i] * jobHours[i];
  }
  // slotsNeeded is carried unclamped for the autoscaler.
  const slotsProvisioned = paused
    ? 0
    : policy.scaleToZero
      ? Math.max(c.SCALE_TO_ZERO_MIN_SLOTS, Math.ceil(prev.slotsNeeded * c.AUTOSCALE_HEADROOM))
      : policy.concurrency;
  const capacityJobs = slotHoursPerJob > 0 ? slotsProvisioned / slotHoursPerJob : 0;
  const processedTotal = paused || sumDemand <= 0 ? 0 : Math.min(sumDemand, capacityJobs);

  let queueNext = 0;
  let attemptsTotal = 0;
  let weightedP = 0;
  let tokenCost = 0;
  let tokens = 0;
  for (let i = 0; i < n; i++) {
    const w = world.workloads[ids[i]];
    const share = sumDemand > 0 ? demand[i] / sumDemand : 0;
    const processed = processedTotal * share;
    const attempts = processed * m[i];
    const failed = processed * Math.pow(p[i], maxAttempts);
    // Breaker open: failed jobs wait in the queue; closed: exhausted retries are dropped.
    const requeued = breakerOpen ? failed : 0;
    queueNext += demand[i] - processed + requeued;

    // Step 8 — tokens; a failed attempt burns its full prompt and a fraction of its output.
    const model = world.models[tiers[i]];
    const tokensIn = attempts * w.inTokMean;
    const tokensOut = processed * w.outTokMean + (attempts - processed) * w.outTokMean * c.FAILED_OUTPUT_FRACTION;
    const cost = (tokensIn * model.priceInPerM + tokensOut * model.priceOutPerM) / TOKENS_PER_PRICE_UNIT;

    attemptsTotal += attempts;
    weightedP += attempts * p[i];
    tokenCost += cost;
    tokens += tokensIn + tokensOut;
    if (processed > 0 || attempts > 0) {
      byWorkload[ids[i]] = { jobs: processed, attempts, failed, tokensIn, tokensOut, tokenCost: cost, tier: tiers[i] };
    }
  }

  // Step 9 — reserved capacity is billed whether or not it is used.
  const capacityCost = slotsProvisioned * c.SLOT_HOUR_PRICE;

  // Step 10 — a fleet breaches when its backlog exceeds SLA_BACKLOG_HOURS of fresh arrivals.
  const slaBreached = queueNext > c.SLA_BACKLOG_HOURS * sumA;

  const runtime: FleetRuntime = {
    policy,
    queueDepth: Math.max(0, queueNext),
    // The attempt-weighted mean of clamped rates can round a hair above the cap; keep the invariant exact.
    errorRate: attemptsTotal > 0 ? Math.min(c.MAX_ERROR_RATE, weightedP / attemptsTotal) : 0,
    stormExcess,
    attemptsPerJob: processedTotal > 0 ? attemptsTotal / processedTotal : 0,
    utilization: slotsProvisioned > 0 ? Math.min(1, slotsNeeded / slotsProvisioned) : 0,
    slotsNeeded,
    slotsProvisioned,
    breakerOpen,
    slaBreached,
  };
  return { runtime, tokenCost, tokens, capacityCost };
}

function emptyDay(day: number): DaySample {
  return { day, cashClose: 0, revenue: 0, tokenCost: 0, capacityCost: 0, opex: 0, tokens: 0, byWorkload: {}, capacityByFleet: {} };
}

/** Fold an hour into the partial day (returns a new sample; the input is not mutated). */
function foldDay(acc: DaySample | null, hour: HourSample): DaySample {
  const day = acc ?? emptyDay(Math.floor(hour.t / HOURS_PER_DAY));
  const byWorkload: Record<string, WorkloadHour> = { ...day.byWorkload };
  for (const id in hour.byWorkload) {
    const h = hour.byWorkload[id];
    const d = byWorkload[id];
    byWorkload[id] = d
      ? {
          jobs: d.jobs + h.jobs,
          attempts: d.attempts + h.attempts,
          failed: d.failed + h.failed,
          tokensIn: d.tokensIn + h.tokensIn,
          tokensOut: d.tokensOut + h.tokensOut,
          tokenCost: d.tokenCost + h.tokenCost,
          tier: h.tier, // the day's entry carries the latest tier the workload ran on
        }
      : { ...h };
  }
  const capacityByFleet: Record<string, number> = { ...day.capacityByFleet };
  for (const id in hour.capacityByFleet) capacityByFleet[id] = (capacityByFleet[id] ?? 0) + hour.capacityByFleet[id];
  return {
    day: day.day,
    cashClose: hour.cashClose,
    revenue: day.revenue + hour.revenue,
    tokenCost: day.tokenCost + hour.tokenCost,
    capacityCost: day.capacityCost + hour.capacityCost,
    opex: day.opex + hour.opex,
    tokens: day.tokens + hour.tokens,
    byWorkload,
    capacityByFleet,
  };
}

/** One sim-hour. `state.t` is the pre-tick hour being simulated. */
export function tickHour(state: SimState, config: SimConfig, hourRng: HourRng): SimState {
  if (state.status === 'bankrupt') return state;
  const c = config.constants;
  const world = state.world;
  const t = state.t;

  // Step 1 — arrivals, one draw per workload in tick order.
  const arrivals = hourArrivals(world, t, c, hourRng);

  const fleets: Record<string, FleetRuntime> = {};
  const byWorkload: Record<string, WorkloadHour> = {};
  const capacityByFleet: Record<string, number> = {};
  let tokenCost = 0;
  let tokens = 0;
  let capacityCost = 0;
  for (const fleetId of world.fleetOrder) {
    const r = tickFleet(world.fleets[fleetId], state.fleets[fleetId], arrivals, state, c, byWorkload);
    fleets[fleetId] = r.runtime;
    capacityByFleet[fleetId] = r.capacityCost;
    tokenCost += r.tokenCost;
    tokens += r.tokens;
    capacityCost += r.capacityCost;
  }

  // Steps 10–11 — revenue: breached contracts accrue nothing this hour.
  let revenue = 0;
  for (const cid of world.customerOrder) {
    const cust = world.customers[cid];
    const breached = cust.servedBy.some((f) => fleets[f]?.slaBreached);
    revenue += breached ? 0 : cust.arr / c.HOURS_PER_YEAR;
  }
  const opex = c.FIXED_OPEX_PER_MONTH / c.HOURS_PER_MONTH;
  let cash = state.cash + revenue - tokenCost - capacityCost - opex;
  let status: SimState['status'] = state.status;
  let bankruptAt = state.bankruptAt;
  if (t >= PRELUDE_HOURS && cash <= 0) {
    // TODO(prestige): the post-mortem hook fires from events.ts on this transition.
    status = 'bankrupt';
    bankruptAt = t + 1;
    cash = 0;
  }

  // Step 12 — bookkeeping.
  const sample: HourSample = { t, cashClose: cash, revenue, tokenCost, capacityCost, opex, tokens, byWorkload, capacityByFleet };
  const keep = Math.max(0, state.hourly.length + 1 - c.HOURLY_WINDOW);
  const hourly = state.hourly.slice(keep);
  hourly.push(sample);

  const folded = foldDay(state.dayAcc, sample);
  const dayDone = (t + 1) % HOURS_PER_DAY === 0;
  const daily = dayDone ? state.daily.concat([folded]) : state.daily;
  const dayAcc = dayDone ? null : folded;

  return {
    version: state.version,
    seed: state.seed,
    t: t + 1,
    cash,
    status,
    bankruptAt,
    world,
    fleets,
    routing: state.routing,
    hourly,
    daily,
    dayAcc,
    totals: {
      revenue: state.totals.revenue + revenue,
      tokenCost: state.totals.tokenCost + tokenCost,
      capacityCost: state.totals.capacityCost + capacityCost,
      opex: state.totals.opex + opex,
      tokens: state.totals.tokens + tokens,
    },
  };
}

/** Advance `dtHours` whole sim-hours. A no-op when bankrupt. */
export function step(state: SimState, dtHours: number, config: SimConfig, rng: Rng): SimState {
  if (!Number.isInteger(dtHours) || dtHours < 0) throw new RangeError(`step: dtHours must be a non-negative integer, got ${dtHours}`);
  let s = state;
  for (let i = 0; i < dtHours; i++) {
    if (s.status === 'bankrupt') break;
    s = tickHour(s, config, rng.forHour(s.t));
  }
  return s;
}
