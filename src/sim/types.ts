/**
 * Sim contract — every shape shared between the simulation (`src/sim`) and
 * the console (`src/console`). Plan §3.2, §3.6 (T1).
 *
 * Pure types plus one lookup table. No IO, no DOM, no clock.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type Tier = 'small' | 'medium' | 'frontier';

/** Ordering of tiers by capability; used for the honest-tiering error penalty. */
export const TIER_RANK: Record<Tier, number> = { small: 0, medium: 1, frontier: 2 };

export type SizeClass = 'trivial' | 'standard' | 'heavy';

export type FleetFamily = 'ingest' | 'summarizer' | 'monitor' | 'relay' | 'ledger';

// ---------------------------------------------------------------------------
// World definition (generated once per seed; never mutated after genesis)
// ---------------------------------------------------------------------------

export interface ModelDef {
  tier: Tier;
  name: string;
  priceInPerM: number;
  priceOutPerM: number;
  outTokensPerSec: number;
  baseErrorRate: number;
}

export interface WorkloadDef {
  id: string;
  name: string;
  fleetId: string;
  jobsPerHour: number;
  inTokMean: number;
  outTokMean: number;
  /** Derived from inTokMean + outTokMean at generation. */
  sizeClass: SizeClass;
  /** The tier that passes the eval; routing below it is penalised (honest tiering). */
  minTier: Tier;
  /** Weekday/daytime-shaped demand. */
  businessHours: boolean;
  /** customerId → share, sums to 1 (drives group-by customer). */
  customerShares: Record<string, number>;
}

/** 'MM-DD'; the co-founder's voice; never addresses the player. */
export interface CoFounderNote {
  date: string;
  text: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: 'none' | 'exponential';
  circuitBreaker: boolean;
}

export interface FleetPolicy {
  status: 'active' | 'paused';
  concurrency: number;
  scaleToZero: boolean;
  retry: RetryPolicy;
}

export interface FleetDef {
  id: string;
  name: string;
  family: FleetFamily;
  role: string;
  defaultTier: Tier;
  provisionedSlots: number;
  workloadIds: string[];
  notes: CoFounderNote[];
  initialPolicy: FleetPolicy;
  /** Planted retry-storm pressure (0 for healthy fleets). */
  initialStormExcess: number;
}

export interface RoutingMatch {
  fleetId?: string;
  workloadId?: string;
  sizeClass?: SizeClass;
}

export interface RoutingRule {
  id: string;
  priority: number;
  match: RoutingMatch;
  tier: Tier;
  note?: string;
  author: 'cofounder' | 'operator';
}

export interface CustomerDef {
  id: string;
  name: string;
  kind: 'segment' | 'account';
  accounts: number;
  arr: number;
  servedBy: string[];
}

export interface WorldDef {
  seed: number;
  models: Record<Tier, ModelDef>;
  fleets: Record<string, FleetDef>;
  fleetOrder: string[];
  workloads: Record<string, WorkloadDef>;
  customers: Record<string, CustomerDef>;
  customerOrder: string[];
  /** The co-founder's initial rules. */
  routing: RoutingRule[];
  /** Fleet ids; tests, report and the post-mortem hook only — never shown. */
  bleeds: { tiering: string | null; retryStorm: string | null; idle: string[] };
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface FleetRuntime {
  policy: FleetPolicy;
  queueDepth: number;
  /** Attempt-weighted p over the hour (0 when no attempts). */
  errorRate: number;
  stormExcess: number;
  /** attempts / processed (0 when nothing processed). */
  attemptsPerJob: number;
  utilization: number;
  /**
   * Carried unclamped so scale-to-zero autoscaling (§3.4 step 7) never has to
   * reconstruct it from a clamped utilization.
   */
  slotsNeeded: number;
  slotsProvisioned: number;
  breakerOpen: boolean;
  slaBreached: boolean;
}

export interface WorkloadHour {
  jobs: number;
  attempts: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  tokenCost: number;
  tier: Tier;
}

export interface HourSample {
  t: number;
  cashClose: number;
  revenue: number;
  tokenCost: number;
  capacityCost: number;
  opex: number;
  tokens: number;
  byWorkload: Record<string, WorkloadHour>;
  capacityByFleet: Record<string, number>;
}

export interface DaySample {
  day: number;
  cashClose: number;
  revenue: number;
  tokenCost: number;
  capacityCost: number;
  opex: number;
  tokens: number;
  byWorkload: Record<string, WorkloadHour>;
  capacityByFleet: Record<string, number>;
}

export interface SimState {
  version: number;
  seed: number;
  /** Completed sim-hours since genesis; login is at t = PRELUDE_HOURS. */
  t: number;
  cash: number;
  status: 'running' | 'bankrupt';
  bankruptAt: number | null;
  world: WorldDef;
  fleets: Record<string, FleetRuntime>;
  routing: RoutingRule[];
  /** Ring, last HOURLY_WINDOW hours (672 = 28 days). */
  hourly: HourSample[];
  /** Whole run including prelude, one per completed sim-day. */
  daily: DaySample[];
  /** Partial current day. */
  dayAcc: DaySample | null;
  totals: { revenue: number; tokenCost: number; capacityCost: number; opex: number; tokens: number };
}

// ---------------------------------------------------------------------------
// Tuning (keys declared here, values in constants.ts — T3)
// ---------------------------------------------------------------------------

/** Generator knobs (§3.6 DEFAULT_WORLD_PARAMS). */
export interface WorldParams {
  fleetCount: number;
  idleFleetCount: number;
  idleSlotsPerFleet: number;
  idleJobsPerHour: number;
  /** Scenario switch for report.ts and tests. */
  bleeds: { tiering: boolean; retryStorm: boolean; idle: boolean };
  bleedA: { jobsPerHour: number; inTok: number; outTok: number; split: number[] };
  bleedB: {
    jobsPerHour: number;
    inTok: number;
    outTok: number;
    maxAttempts: number;
    stormExcess0: number;
    stormPeakP: number;
    slotHeadroom: number;
  };
  healthyTokensPerMonth: number;
  healthyTierMix: Record<Tier, number>;
  healthyOutFraction: number;
  healthySlotsTotal: number;
  provisionHeadroom: number;
  arrTotal: number;
  namedAccounts: { name: string; arr: number; servedByFamily: FleetFamily }[];
  segments: { id: string; name: string; accounts: number; arrShare: number }[];
  homeSegments: Record<string, string[]>;
}

/**
 * The physics the generator must share with step.ts; T3's createState fills
 * it from CONSTANTS so the two can never disagree.
 */
export interface WorldPhysics {
  prefillTps: number;
  overheadS: number;
  diurnalAmplitude: number;
  hoursPerMonth: number;
  trivialMax: number;
  standardMax: number;
}

/** Every numeric knob (§3.6). One tuning file supplies the values. */
export interface Constants {
  OPENING_CASH: number;
  ARR_TOTAL: number;
  FIXED_OPEX_PER_MONTH: number;
  SLOT_HOUR_PRICE: number;
  HOURS_PER_WEEK: number;
  HOURS_PER_MONTH: number;
  HOURS_PER_YEAR: number;
  HOURLY_WINDOW: number;
  PREFILL_TPS: number;
  JOB_OVERHEAD_S: number;
  SIZE_CLASS_TRIVIAL_MAX: number;
  SIZE_CLASS_STANDARD_MAX: number;
  UNDER_TIER_ERROR_PENALTY: number;
  FAILED_OUTPUT_FRACTION: number;
  MAX_ERROR_RATE: number;
  STORM_GAIN: number;
  STORM_EXCESS_CAP: number;
  NATURAL_RECOVERY_PER_HOUR: number;
  BREAKER_TRIP: number;
  BREAKER_RESET: number;
  BREAKER_RECOVERY_PER_HOUR: number;
  BACKOFF_RECOVERY_PER_HOUR: number;
  SCALE_TO_ZERO_MIN_SLOTS: number;
  AUTOSCALE_HEADROOM: number;
  DIURNAL_AMPLITUDE: number;
  DIURNAL_PEAK_HOUR: number;
  DAYS_PER_WEEK: number;
  WEEKEND_START_DAY: number;
  WEEKEND_FACTOR: number;
  JITTER_SIGMA: number;
  SLA_BACKLOG_HOURS: number;
  ERROR_BUDGET_SLO_MISS: number;
  CHECKPOINT_EVERY_HOURS: number;
  SIM_VERSION: number;
  TIERS: Record<Tier, ModelDef>;
  world: WorldParams;
}

export interface SimConfig {
  constants: Constants;
}

// ---------------------------------------------------------------------------
// Actions and the event log
// ---------------------------------------------------------------------------

export type Action =
  /** Upsert by rule.id. */
  | { type: 'routing.set'; rule: RoutingRule }
  | { type: 'routing.remove'; ruleId: string }
  | {
      type: 'fleet.policy';
      fleetId: string;
      patch: Partial<Omit<FleetPolicy, 'retry'>> & { retry?: Partial<RetryPolicy> };
    };

export type SimEvent =
  /** t = PRELUDE_HOURS. */
  | { type: 'run.start'; t: number; seed: number; wallMs: number; version: number }
  | (Action & { t: number; wallMs: number })
  | { type: 'checkpoint'; t: number; hash: string };
