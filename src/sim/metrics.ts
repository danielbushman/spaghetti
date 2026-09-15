/**
 * Selectors over the ledger. Plan §3.8 (T3).
 *
 * Every number a room shows comes from here or from `explore.ts`. Per-day
 * figures are the trailing 24 h of `hourly` scaled to a day; 7-day
 * re-pricings use the trailing 168 h. Every ratio is guarded the way the
 * tick guards its own: a zero denominator reads 0, never NaN.
 *
 * Nothing here is stored. Incidents are derived on every call.
 */
import type {
  DaySample,
  FleetDef,
  FleetFamily,
  FleetPolicy,
  HourSample,
  ModelDef,
  RoutingRule,
  SimConfig,
  SimState,
  SizeClass,
  Tier,
  WorkloadHour,
  CoFounderNote,
} from './types';
import { TIER_RANK } from './types';
import { DEFAULT_CONFIG } from './constants';
import { resolveTier } from './step';

export const TIER_ORDER: readonly Tier[] = ['small', 'medium', 'frontier'];
export const SIZE_CLASS_ORDER: readonly SizeClass[] = ['trivial', 'standard', 'heavy'];

const HOURS_PER_DAY = 24;
const TOKENS_PER_PRICE_UNIT = 1e6;

/** A retry storm: more than this many attempts per job … */
export const STORM_ATTEMPTS_THRESHOLD = 1.5;
/** … at more than this attempt-weighted error rate. */
export const STORM_ERROR_THRESHOLD = 0.3;
/** Runway sparklines saturate here when a day was climbing (its true runway is unbounded). */
export const RUNWAY_CEILING_MONTHS = 120;

// ---------------------------------------------------------------------------
// Windows and aggregation (shared with explore.ts)
// ---------------------------------------------------------------------------

/** The last `n` hourly samples (fewer early in a run). */
export function trailingHours(state: SimState, n: number): HourSample[] {
  return state.hourly.slice(Math.max(0, state.hourly.length - n));
}

/** The last `n` daily samples (fewer early in a run). */
export function trailingDays(state: SimState, n: number): DaySample[] {
  return state.daily.slice(Math.max(0, state.daily.length - n));
}

/** Any sample that carries a ledger breakdown: hours and days share the shape. */
export type LedgerSample = Pick<HourSample, 'byWorkload' | 'capacityByFleet' | 'tokens' | 'revenue' | 'tokenCost' | 'capacityCost' | 'opex'>;

export interface TokenSum {
  jobs: number;
  attempts: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  tokenCost: number;
}

export function emptySum(): TokenSum {
  return { jobs: 0, attempts: 0, failed: 0, tokensIn: 0, tokensOut: 0, tokenCost: 0 };
}

function addInto(sum: TokenSum, h: WorkloadHour): void {
  sum.jobs += h.jobs;
  sum.attempts += h.attempts;
  sum.failed += h.failed;
  sum.tokensIn += h.tokensIn;
  sum.tokensOut += h.tokensOut;
  sum.tokenCost += h.tokenCost;
}

/** Σ per (workload, tier) over the samples. */
export type WorkloadTierSums = Record<string, Partial<Record<Tier, TokenSum>>>;

export function sumByWorkloadTier(samples: readonly LedgerSample[]): WorkloadTierSums {
  const out: WorkloadTierSums = {};
  for (const s of samples) {
    for (const id in s.byWorkload) {
      const h = s.byWorkload[id];
      const byTier = (out[id] ??= {});
      addInto((byTier[h.tier] ??= emptySum()), h);
    }
  }
  return out;
}

/** Σ over every tier of one workload's sums. */
export function totalOf(byTier: Partial<Record<Tier, TokenSum>> | undefined): TokenSum {
  const sum = emptySum();
  if (!byTier) return sum;
  for (const tier of TIER_ORDER) {
    const s = byTier[tier];
    if (!s) continue;
    sum.jobs += s.jobs;
    sum.attempts += s.attempts;
    sum.failed += s.failed;
    sum.tokensIn += s.tokensIn;
    sum.tokensOut += s.tokensOut;
    sum.tokenCost += s.tokenCost;
  }
  return sum;
}

/** Σ capacity cost per fleet over the samples. */
export function sumCapacityByFleet(samples: readonly LedgerSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) for (const id in s.capacityByFleet) out[id] = (out[id] ?? 0) + s.capacityByFleet[id];
  return out;
}

/** Scale a span sum to a per-day figure; 0 when the span is empty. */
export function perDay(sum: number, hours: number): number {
  return hours > 0 ? (sum * HOURS_PER_DAY) / hours : 0;
}

/** Recorded tokens priced at `model`: the reading behind every "if routed here" column. */
export function repriceTokens(tokensIn: number, tokensOut: number, model: ModelDef): number {
  return (tokensIn * model.priceInPerM + tokensOut * model.priceOutPerM) / TOKENS_PER_PRICE_UNIT;
}

/** Attempt-weighted error rate from recorded attempts: failed attempts / attempts. */
export function errorRateOf(sum: TokenSum): number {
  // Every attempt either ends a job (jobs − failed successes) or fails; the
  // failed attempts are attempts − (jobs − failed).
  return sum.attempts > 0 ? Math.max(0, sum.attempts - sum.jobs + sum.failed) / sum.attempts : 0;
}

export function attemptsPerJobOf(sum: TokenSum): number {
  return sum.jobs > 0 ? sum.attempts / sum.jobs : 0;
}

/**
 * A fleet's capacity through its workloads by job share; a fleet with no
 * jobs puts its capacity on its first workload so idle fleets still show.
 */
export function attributeCapacity(fleet: FleetDef, capacity: number, jobsByWorkload: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let jobs = 0;
  for (const id of fleet.workloadIds) jobs += jobsByWorkload[id] ?? 0;
  fleet.workloadIds.forEach((id, i) => {
    out[id] = jobs > 0 ? (capacity * (jobsByWorkload[id] ?? 0)) / jobs : i === 0 ? capacity : 0;
  });
  return out;
}

function netOf(s: LedgerSample): number {
  return s.revenue - s.tokenCost - s.capacityCost - s.opex;
}

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------

/** Net cash flow over the last min(168, available) hours scaled to a week. This is the score. */
export function slopePerWeek(state: SimState, config: SimConfig = DEFAULT_CONFIG): number {
  const week = config.constants.HOURS_PER_WEEK;
  const hs = trailingHours(state, week);
  if (hs.length === 0) return 0;
  let net = 0;
  for (const h of hs) net += netOf(h);
  return (net * week) / hs.length;
}

/** Weeks until cash 0 at the current slope; null when the slope is ≥ 0 (climbing). */
export function runwayWeeks(state: SimState, config: SimConfig = DEFAULT_CONFIG): number | null {
  const slope = slopePerWeek(state, config);
  if (slope >= 0) return null;
  return Math.max(0, state.cash) / -slope;
}

export function runwayMonths(state: SimState, config: SimConfig = DEFAULT_CONFIG): number | null {
  const weeks = runwayWeeks(state, config);
  if (weeks === null) return null;
  const c = config.constants;
  return (weeks * c.HOURS_PER_WEEK) / c.HOURS_PER_MONTH;
}

export interface ProjectedZero {
  weeksFromNow: number;
  atT: number;
}

/** Linear projection of the trailing-week slope to cash 0. */
export function projectedZero(state: SimState, config: SimConfig = DEFAULT_CONFIG): ProjectedZero | null {
  const weeks = runwayWeeks(state, config);
  if (weeks === null) return null;
  return { weeksFromNow: weeks, atT: state.t + weeks * config.constants.HOURS_PER_WEEK };
}

export type WeeksBought = { kind: 'delta'; weeks: number } | { kind: 'climbing' } | { kind: 'nowFinite'; runwayWeeks: number };

/**
 * The honest "that bought four days" number: runway now against the runway
 * at the action less the weeks that have elapsed since.
 */
export function weeksBought(
  runwayBeforeWk: number | null,
  runwayAfterWk: number | null,
  hoursAdvanced: number,
  config: SimConfig = DEFAULT_CONFIG,
): WeeksBought {
  if (runwayAfterWk === null) return { kind: 'climbing' };
  if (runwayBeforeWk === null) return { kind: 'nowFinite', runwayWeeks: runwayAfterWk };
  const elapsed = hoursAdvanced / config.constants.HOURS_PER_WEEK;
  return { kind: 'delta', weeks: runwayAfterWk - Math.max(0, runwayBeforeWk - elapsed) };
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

export interface HeadlineSignal {
  id: 'runway' | 'net' | 'tokens' | 'errors';
  label: string;
  unit: string;
  value: number | null;
  /** One point per completed sim-day, up to 28. */
  history: number[];
  goodWhen: 'up' | 'down';
}

export const HEADLINE_HISTORY_DAYS = 28;

function dailyErrorRate(d: DaySample): number {
  const sum = emptySum();
  for (const id in d.byWorkload) addInto(sum, d.byWorkload[id]);
  return errorRateOf(sum);
}

/** Four signals — runway, net/week, tokens/day, error rate — each with a 28-day history. */
export function headline(state: SimState, config: SimConfig = DEFAULT_CONFIG): HeadlineSignal[] {
  const c = config.constants;
  const daysPerWeek = c.HOURS_PER_WEEK / HOURS_PER_DAY;
  const days = state.daily;
  const first = Math.max(0, days.length - HEADLINE_HISTORY_DAYS);

  const runwayHist: number[] = [];
  const netHist: number[] = [];
  const tokensHist: number[] = [];
  const errorsHist: number[] = [];
  for (let i = first; i < days.length; i++) {
    // Trailing-week net at day i, scaled to a full week.
    const from = Math.max(0, i - daysPerWeek + 1);
    let net = 0;
    for (let j = from; j <= i; j++) net += netOf(days[j]);
    const weekly = (net * daysPerWeek) / (i - from + 1);
    netHist.push(weekly);
    const months = weekly < 0 ? (days[i].cashClose / -weekly) * (c.HOURS_PER_WEEK / c.HOURS_PER_MONTH) : RUNWAY_CEILING_MONTHS;
    runwayHist.push(Math.min(RUNWAY_CEILING_MONTHS, Math.max(0, months)));
    tokensHist.push(days[i].tokens);
    errorsHist.push(dailyErrorRate(days[i]));
  }

  const day = trailingHours(state, HOURS_PER_DAY);
  const daySum = emptySum();
  let dayTokens = 0;
  for (const h of day) {
    dayTokens += h.tokens;
    for (const id in h.byWorkload) addInto(daySum, h.byWorkload[id]);
  }

  return [
    { id: 'runway', label: 'runway', unit: 'mo', value: runwayMonths(state, config), history: runwayHist, goodWhen: 'up' },
    { id: 'net', label: 'net / week', unit: '$', value: slopePerWeek(state, config), history: netHist, goodWhen: 'up' },
    { id: 'tokens', label: 'tokens / day', unit: 'tok', value: perDay(dayTokens, day.length), history: tokensHist, goodWhen: 'down' },
    { id: 'errors', label: 'error rate', unit: '%', value: errorRateOf(daySum), history: errorsHist, goodWhen: 'down' },
  ];
}

// ---------------------------------------------------------------------------
// Incidents (derived, never stored)
// ---------------------------------------------------------------------------

export interface Incident {
  id: string;
  kind: 'retry-storm' | 'backlog';
  fleetId: string;
  /** Sim-hour `t` of the first hour the condition held (oldest in the ring when it held throughout). */
  since: number;
  costPerDay: number;
  summary: string;
}

function fleetSumOfHour(fleet: FleetDef, h: HourSample): TokenSum {
  const sum = emptySum();
  for (const id of fleet.workloadIds) {
    const w = h.byWorkload[id];
    if (w) addInto(sum, w);
  }
  return sum;
}

function isStorm(attemptsPerJob: number, errorRate: number): boolean {
  return attemptsPerJob > STORM_ATTEMPTS_THRESHOLD && errorRate > STORM_ERROR_THRESHOLD;
}

/** The customers whose `servedBy` includes the fleet. */
export function customersOf(state: SimState, fleetId: string): { id: string; name: string; arr: number }[] {
  const out: { id: string; name: string; arr: number }[] = [];
  for (const cid of state.world.customerOrder) {
    const cust = state.world.customers[cid];
    if (cust.servedBy.includes(fleetId)) out.push({ id: cust.id, name: cust.name, arr: cust.arr });
  }
  return out;
}

export function openIncidents(state: SimState, config: SimConfig = DEFAULT_CONFIG): Incident[] {
  const c = config.constants;
  const world = state.world;
  const out: Incident[] = [];
  const latestT = Math.max(0, state.t - 1);
  const day = trailingHours(state, HOURS_PER_DAY);

  for (const fleetId of world.fleetOrder) {
    const fleet = world.fleets[fleetId];
    const rt = state.fleets[fleetId];

    if (isStorm(rt.attemptsPerJob, rt.errorRate)) {
      // Scan back through the ring while the recorded hours still show the storm.
      let since = latestT;
      for (let i = state.hourly.length - 1; i >= 0; i--) {
        const s = fleetSumOfHour(fleet, state.hourly[i]);
        if (!isStorm(attemptsPerJobOf(s), errorRateOf(s))) break;
        since = state.hourly[i].t;
      }
      // Excess attempts re-priced: what the recorded tokens cost beyond doing each job once.
      let excess = 0;
      for (const h of day) {
        for (const id of fleet.workloadIds) {
          const rec = h.byWorkload[id];
          if (!rec) continue;
          const w = world.workloads[id];
          excess += rec.tokenCost - repriceTokens(rec.jobs * w.inTokMean, rec.jobs * w.outTokMean, world.models[rec.tier]);
        }
      }
      out.push({
        id: `retry-storm:${fleetId}`,
        kind: 'retry-storm',
        fleetId,
        since,
        costPerDay: perDay(Math.max(0, excess), day.length),
        summary: `${Math.round(rt.errorRate * 100)}% errors · ${rt.attemptsPerJob.toFixed(2)} attempts/job`,
      });
    }

    if (rt.slaBreached) {
      // Revenue the breach forfeits per day: every customer this fleet serves.
      const served = customersOf(state, fleetId);
      let arr = 0;
      for (const cust of served) arr += cust.arr;
      out.push({
        id: `backlog:${fleetId}`,
        kind: 'backlog',
        fleetId,
        // TODO(incidents): the hourly ring carries no queue, so a backlog's `since` is the latest hour.
        since: latestT,
        costPerDay: (arr / c.HOURS_PER_YEAR) * HOURS_PER_DAY,
        summary: `queue ${Math.round(rt.queueDepth).toLocaleString('en-US')} jobs · ${served.length} customer${served.length === 1 ? '' : 's'} breached`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fleets
// ---------------------------------------------------------------------------

export interface FleetSummary {
  id: string;
  name: string;
  family: FleetFamily;
  role: string;
  status: FleetPolicy['status'];
  /** Share of the trailing day's tokens per tier (sums to 1; resolved tiers when no tokens). */
  tierMix: Record<Tier, number>;
  costPerDay: number;
  tokensPerDay: number;
  errorRate: number;
  attemptsPerJob: number;
  utilization: number;
  queueDepth: number;
  slots: number;
  costHistory7d: number[];
  /** The price of a pause: every customer the fleet serves. */
  serves: { id: string; name: string; arrPerMonth: number }[];
}

function zeroTiers(): Record<Tier, number> {
  return { small: 0, medium: 0, frontier: 0 };
}

function fleetCostOfDay(fleet: FleetDef, d: DaySample): number {
  let cost = d.capacityByFleet[fleet.id] ?? 0;
  for (const id of fleet.workloadIds) cost += d.byWorkload[id]?.tokenCost ?? 0;
  return cost;
}

function summarise(state: SimState, fleet: FleetDef, day: HourSample[], sums: WorkloadTierSums, capacity: Record<string, number>, config: SimConfig): FleetSummary {
  const c = config.constants;
  const rt = state.fleets[fleet.id];
  const tierMix = zeroTiers();
  let tokens = 0;
  let tokenCost = 0;
  for (const id of fleet.workloadIds) {
    const byTier = sums[id];
    if (!byTier) continue;
    for (const tier of TIER_ORDER) {
      const s = byTier[tier];
      if (!s) continue;
      tierMix[tier] += s.tokensIn + s.tokensOut;
      tokens += s.tokensIn + s.tokensOut;
      tokenCost += s.tokenCost;
    }
  }
  if (tokens > 0) {
    for (const tier of TIER_ORDER) tierMix[tier] /= tokens;
  } else if (fleet.workloadIds.length > 0) {
    // Nothing recorded: the mix is where the rules would send the work.
    for (const id of fleet.workloadIds) tierMix[resolveTier(state.routing, fleet.id, state.world.workloads[id], fleet.defaultTier).tier] += 1 / fleet.workloadIds.length;
  }
  const days7 = trailingDays(state, c.HOURS_PER_WEEK / HOURS_PER_DAY);
  return {
    id: fleet.id,
    name: fleet.name,
    family: fleet.family,
    role: fleet.role,
    status: rt.policy.status,
    tierMix,
    costPerDay: perDay(tokenCost + (capacity[fleet.id] ?? 0), day.length),
    tokensPerDay: perDay(tokens, day.length),
    errorRate: rt.errorRate,
    attemptsPerJob: rt.attemptsPerJob,
    utilization: rt.utilization,
    queueDepth: rt.queueDepth,
    slots: rt.slotsProvisioned,
    costHistory7d: days7.map((d) => fleetCostOfDay(fleet, d)),
    serves: customersOf(state, fleet.id).map((cust) => ({ id: cust.id, name: cust.name, arrPerMonth: (cust.arr * c.HOURS_PER_MONTH) / c.HOURS_PER_YEAR })),
  };
}

export function fleetSummaries(state: SimState, config: SimConfig = DEFAULT_CONFIG): FleetSummary[] {
  const day = trailingHours(state, HOURS_PER_DAY);
  const sums = sumByWorkloadTier(day);
  const capacity = sumCapacityByFleet(day);
  return state.world.fleetOrder.map((id) => summarise(state, state.world.fleets[id], day, sums, capacity, config));
}

export interface FleetWorkloadRow {
  id: string;
  name: string;
  sizeClass: SizeClass;
  tier: Tier;
  ruleId: string | null;
  avgTokensPerJob: number;
  jobsPerHour: number;
  costPerDay: number;
  errorRate: number;
  minTier: Tier;
  /** Last 7 days' recorded tokens re-priced at each tier, per day. */
  repricedPerDay: Record<Tier, number>;
}

export type FleetDetail = FleetSummary & {
  notes: CoFounderNote[];
  policy: FleetPolicy;
  workloads: FleetWorkloadRow[];
  tokenCurve7d: { t: number; byTier: Record<Tier, number> }[];
  /** Σ failed / (ERROR_BUDGET_SLO_MISS × Σ jobs) over the trailing week; 0 when nothing ran. */
  errorBudgetUsed: number;
  incidents: Incident[];
};

/** Recorded tokens of one workload (all tiers) re-priced at every tier, per day. */
function repricedOf(state: SimState, byTier: Partial<Record<Tier, TokenSum>> | undefined, hours: number): Record<Tier, number> {
  const total = totalOf(byTier);
  const out = zeroTiers();
  for (const tier of TIER_ORDER) out[tier] = perDay(repriceTokens(total.tokensIn, total.tokensOut, state.world.models[tier]), hours);
  return out;
}

export function fleetDetail(state: SimState, fleetId: string, config: SimConfig = DEFAULT_CONFIG): FleetDetail | null {
  const c = config.constants;
  const fleet = state.world.fleets[fleetId];
  if (!fleet) return null;
  const day = trailingHours(state, HOURS_PER_DAY);
  const week = trailingHours(state, c.HOURS_PER_WEEK);
  const sumsDay = sumByWorkloadTier(day);
  const sumsWeek = sumByWorkloadTier(week);
  const capacityDay = sumCapacityByFleet(day);
  const summary = summarise(state, fleet, day, sumsDay, capacityDay, config);

  const jobsByWorkload: Record<string, number> = {};
  for (const id of fleet.workloadIds) jobsByWorkload[id] = totalOf(sumsDay[id]).jobs;
  const capShare = attributeCapacity(fleet, capacityDay[fleetId] ?? 0, jobsByWorkload);

  const workloads: FleetWorkloadRow[] = fleet.workloadIds.map((id) => {
    const w = state.world.workloads[id];
    const { tier, ruleId } = resolveTier(state.routing, fleetId, w, fleet.defaultTier);
    const s = totalOf(sumsDay[id]);
    const tokens = s.tokensIn + s.tokensOut;
    return {
      id,
      name: w.name,
      sizeClass: w.sizeClass,
      tier,
      ruleId,
      avgTokensPerJob: s.jobs > 0 ? tokens / s.jobs : w.inTokMean + w.outTokMean,
      jobsPerHour: day.length > 0 ? s.jobs / day.length : w.jobsPerHour,
      costPerDay: perDay(s.tokenCost + capShare[id], day.length),
      errorRate: errorRateOf(s),
      minTier: w.minTier,
      repricedPerDay: repricedOf(state, sumsWeek[id], week.length),
    };
  });

  const tokenCurve7d = week.map((h) => {
    const byTier = zeroTiers();
    for (const id of fleet.workloadIds) {
      const rec = h.byWorkload[id];
      if (rec) byTier[rec.tier] += rec.tokensIn + rec.tokensOut;
    }
    return { t: h.t, byTier };
  });

  const weekSum = emptySum();
  for (const id of fleet.workloadIds) {
    const s = totalOf(sumsWeek[id]);
    weekSum.jobs += s.jobs;
    weekSum.failed += s.failed;
  }
  const errorBudgetUsed = weekSum.jobs > 0 ? weekSum.failed / (c.ERROR_BUDGET_SLO_MISS * weekSum.jobs) : 0;

  return {
    ...summary,
    notes: fleet.notes,
    policy: state.fleets[fleetId].policy,
    workloads,
    tokenCurve7d,
    errorBudgetUsed,
    incidents: openIncidents(state, config).filter((i) => i.fleetId === fleetId),
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface RoutingRow {
  rule: RoutingRule;
  workloadsCovered: string[];
  tokensPerDay: number;
  costPerDay: number;
}

export interface RoutingWorkload {
  id: string;
  fleetId: string;
  name: string;
  sizeClass: SizeClass;
  minTier: Tier;
  tier: Tier;
  ruleId: string | null;
  repricedPerDay: Record<Tier, number>;
}

export interface RoutingCell {
  tokensPerDay: number;
  costPerDay: number;
  jobsPerDay: number;
  /** The cell's last-7-day tokens re-priced at each tier, per day. */
  repricedPerDay: Record<Tier, number>;
  /** How many of the cell's workloads have an eval floor above each tier. */
  belowFloor: Record<Tier, number>;
}

export interface RoutingTable {
  rows: RoutingRow[];
  workloads: RoutingWorkload[];
  /** Size class × the tier the tokens were recorded on. */
  grid: Record<SizeClass, Record<Tier, RoutingCell>>;
}

export function routingTable(state: SimState, config: SimConfig = DEFAULT_CONFIG): RoutingTable {
  const c = config.constants;
  const world = state.world;
  const day = trailingHours(state, HOURS_PER_DAY);
  const week = trailingHours(state, c.HOURS_PER_WEEK);
  const sumsDay = sumByWorkloadTier(day);
  const sumsWeek = sumByWorkloadTier(week);

  const workloads: RoutingWorkload[] = [];
  for (const fleetId of world.fleetOrder) {
    const fleet = world.fleets[fleetId];
    for (const id of fleet.workloadIds) {
      const w = world.workloads[id];
      const { tier, ruleId } = resolveTier(state.routing, fleetId, w, fleet.defaultTier);
      workloads.push({ id, fleetId, name: w.name, sizeClass: w.sizeClass, minTier: w.minTier, tier, ruleId, repricedPerDay: repricedOf(state, sumsWeek[id], week.length) });
    }
  }

  const rows: RoutingRow[] = state.routing.map((rule) => {
    const covered = workloads.filter((w) => w.ruleId === rule.id);
    let tokens = 0;
    let cost = 0;
    for (const w of covered) {
      const s = totalOf(sumsDay[w.id]);
      tokens += s.tokensIn + s.tokensOut;
      cost += s.tokenCost;
    }
    return { rule, workloadsCovered: covered.map((w) => w.id), tokensPerDay: perDay(tokens, day.length), costPerDay: perDay(cost, day.length) };
  });

  const grid = {} as Record<SizeClass, Record<Tier, RoutingCell>>;
  for (const sizeClass of SIZE_CLASS_ORDER) {
    grid[sizeClass] = {} as Record<Tier, RoutingCell>;
    for (const tier of TIER_ORDER) {
      let tokens = 0;
      let cost = 0;
      let jobs = 0;
      let tokensIn7 = 0;
      let tokensOut7 = 0;
      const belowFloor = zeroTiers();
      for (const w of workloads) {
        if (w.sizeClass !== sizeClass) continue;
        const d = sumsDay[w.id]?.[tier];
        if (d) {
          tokens += d.tokensIn + d.tokensOut;
          cost += d.tokenCost;
          jobs += d.jobs;
        }
        const wk = sumsWeek[w.id]?.[tier];
        if (!wk) continue;
        tokensIn7 += wk.tokensIn;
        tokensOut7 += wk.tokensOut;
        for (const at of TIER_ORDER) if (TIER_RANK[w.minTier] > TIER_RANK[at]) belowFloor[at] += 1;
      }
      const repricedPerDay = zeroTiers();
      for (const at of TIER_ORDER) repricedPerDay[at] = perDay(repriceTokens(tokensIn7, tokensOut7, world.models[at]), week.length);
      grid[sizeClass][tier] = {
        tokensPerDay: perDay(tokens, day.length),
        costPerDay: perDay(cost, day.length),
        jobsPerDay: perDay(jobs, day.length),
        repricedPerDay,
        belowFloor,
      };
    }
  }

  return { rows, workloads, grid };
}
