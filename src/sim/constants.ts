/**
 * The single tuning file. Plan §3.6 (T3).
 *
 * Every numeric knob the simulation and the world generator use lives here.
 * Tests pin outcomes (bankruptcy band, flatten ratio, inflection, pause
 * ordering), never these values, so a retune is a one-file edit.
 *
 * Opening P&L per sim-month (targets, ±10%):
 *   revenue   11.67   (ARR 140M accrued hourly)
 *   tokens    ≈ 20.7  (healthy 1.8 + bleed A 13.4 + bleed B 5.5)
 *   capacity  ≈ 11.4  (healthy 0.9 + A's slots 0.75 + B's slots 0.15 + C 9.6)
 *   opex       3.8
 *   cost      ≈ 36.0  → burn ≈ 24.3 (≈ −$5.6M/wk), runway 150/24.3 ≈ 6.2 mo ≈ 27 wk
 *   bankruptcy band [23, 30] wk  ≡  opening slope band [−6.5M, −5.0M]/wk
 *
 * Reachability of the inflection (fix all three at login):
 *   tokens ≈ 4.5 + capacity ≈ 1.85 + opex 3.8 ≈ 10.1 < 11.67 → ≈ +$1.5M/mo.
 *   Fix (a) alone → burn ≈ 11.0 (slope ratio ≈ 0.45); (b) alone ≈ 21.4;
 *   (c) alone ≈ 14.7; (a)+(b) ≈ 8.1.
 *
 * Pause is priced: pause summarizer-east alone → burn ≈ 13.2 (worse than fix
 * (a)); pause halberd-monitor alone → ≈ 22.5 (worse than fix (b)); pause
 * both → ≈ 11.3 (worse than (a)+(b)); pause every fleet → burn = opex.
 *
 * `bun run sim:report` prints every line above.
 */
import type { Constants, ModelDef, SimConfig, Tier, WorldParams } from './types';

export const TIERS: Record<Tier, ModelDef> = {
  small: { tier: 'small', name: 'spaghetti-s', priceInPerM: 0.1, priceOutPerM: 0.4, outTokensPerSec: 150, baseErrorRate: 0.005 },
  medium: { tier: 'medium', name: 'spaghetti-m', priceInPerM: 1.0, priceOutPerM: 4.0, outTokensPerSec: 80, baseErrorRate: 0.008 },
  frontier: { tier: 'frontier', name: 'spaghetti-xl', priceInPerM: 10.0, priceOutPerM: 40.0, outTokensPerSec: 35, baseErrorRate: 0.01 },
};

export const DEFAULT_WORLD_PARAMS: WorldParams = {
  fleetCount: 40,
  idleFleetCount: 6,
  idleSlotsPerFleet: 8_800,
  idleJobsPerHour: 2,
  /** Scenario switch for report.ts and tests. */
  bleeds: { tiering: true, retryStorm: true, idle: true },
  // ≈ 870B tok/mo; on frontier ≈ $13.4M/mo; on small ≈ $0.13M/mo.
  // Slots: 5.4M × jobHours(frontier 0.000469 h) × 1.25 × 1.3 = 4 114 → ≈ $0.75M/mo reserved.
  bleedA: { jobsPerHour: 5_400_000, inTok: 180, outTok: 40, split: [0.7, 0.3] },
  // Base ≈ $2.55M/mo; saturated at the cap (p 0.61, 2.35 attempts) ≈ $5.5M.
  // Slots ≈ 220 × 2.35 × 1.25 × 1.3 ≈ 840 → ≈ $0.15M/mo reserved.
  bleedB: { jobsPerHour: 41_500, inTok: 6_000, outTok: 600, maxAttempts: 5, stormExcess0: 0.5, stormPeakP: 0.61, slotHeadroom: 1.3 },
  // ≈ $1.8M/mo; the out-fraction is pinned because output tokens cost 4× input.
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
  // arrShare of the non-named remainder (124.3M).
  segments: [
    { id: 'smb', name: 'SMB', accounts: 3_900, arrShare: 0.28 },
    { id: 'mid-market', name: 'Mid-market', accounts: 900, arrShare: 0.34 },
    { id: 'enterprise', name: 'Enterprise', accounts: 120, arrShare: 0.22 },
    { id: 'public-sector', name: 'Public sector', accounts: 60, arrShare: 0.09 },
    { id: 'fintech', name: 'Fintech', accounts: 40, arrShare: 0.07 },
  ],
  homeSegments: { 'summarizer-east': ['smb'], 'halberd-monitor': ['enterprise', 'fintech'] },
};

export const CONSTANTS: Constants = {
  OPENING_CASH: 150_000_000,
  ARR_TOTAL: 140_000_000,
  FIXED_OPEX_PER_MONTH: 3_800_000,
  /** $ per reserved slot-hour. */
  SLOT_HOUR_PRICE: 0.25,
  HOURS_PER_WEEK: 168,
  HOURS_PER_MONTH: 730,
  HOURS_PER_YEAR: 8760,
  /** = PRELUDE_HOURS (28 days). */
  HOURLY_WINDOW: 672,
  PREFILL_TPS: 4000,
  JOB_OVERHEAD_S: 0.5,
  /** Mean in + out tokens. */
  SIZE_CLASS_TRIVIAL_MAX: 500,
  SIZE_CLASS_STANDARD_MAX: 4000,
  UNDER_TIER_ERROR_PENALTY: 0.3,
  FAILED_OUTPUT_FRACTION: 0.5,
  /** Must stay < 1 (§9.4). */
  MAX_ERROR_RATE: 0.9,
  STORM_GAIN: 0.004,
  STORM_EXCESS_CAP: 0.6,
  NATURAL_RECOVERY_PER_HOUR: 0.002,
  BREAKER_TRIP: 0.2,
  BREAKER_RESET: 0.1,
  BREAKER_RECOVERY_PER_HOUR: 0.03,
  BACKOFF_RECOVERY_PER_HOUR: 0.01,
  SCALE_TO_ZERO_MIN_SLOTS: 25,
  AUTOSCALE_HEADROOM: 1.2,
  DIURNAL_AMPLITUDE: 0.25,
  DIURNAL_PEAK_HOUR: 14,
  DAYS_PER_WEEK: 7,
  /** 0-based day of week; days 5 and 6 are the weekend. */
  WEEKEND_START_DAY: 5,
  WEEKEND_FACTOR: 0.7,
  JITTER_SIGMA: 0.08,
  SLA_BACKLOG_HOURS: 24,
  ERROR_BUDGET_SLO_MISS: 0.005,
  CHECKPOINT_EVERY_HOURS: 168,
  SIM_VERSION: 1,
  TIERS,
  world: DEFAULT_WORLD_PARAMS,
};

export const DEFAULT_CONFIG: SimConfig = { constants: CONSTANTS };

/** A config with the world's bleed switches changed; everything else shared. */
export function configWithBleeds(bleeds: Partial<WorldParams['bleeds']>, base: SimConfig = DEFAULT_CONFIG): SimConfig {
  const c = base.constants;
  return { constants: { ...c, world: { ...c.world, bleeds: { ...c.world.bleeds, ...bleeds } } } };
}
