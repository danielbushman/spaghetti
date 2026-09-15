/**
 * Physics shared by the world generator and the tick. Plan §3.4, §7 T2.
 *
 * These are the single definitions: `world.ts` sizes capacity with them and
 * `step.ts` (T3) charges job-hours with them, so the slots a fleet is given
 * always match the job-hours it will be billed for. Pure; imports only types.
 */
import type { ModelDef, SizeClass } from './types';

const SECONDS_PER_HOUR = 3600;

/**
 * Slot-hours one job occupies on `model`:
 * (prefill + decode + fixed overhead) seconds / 3600.
 */
export function jobHoursFor(
  inTok: number,
  outTok: number,
  model: ModelDef,
  prefillTps: number,
  overheadS: number,
): number {
  return (inTok / prefillTps + outTok / model.outTokensPerSec + overheadS) / SECONDS_PER_HOUR;
}

/**
 * Expected attempts per processed job with per-attempt failure `p` and up to
 * `maxAttempts` tries: (1 − p^k) / (1 − p). 1 when p = 0; k when p ≥ 1
 * (unreachable while MAX_ERROR_RATE < 1, but kept finite).
 */
export function attemptsMultiplier(p: number, maxAttempts: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return maxAttempts;
  return (1 - Math.pow(p, maxAttempts)) / (1 - p);
}

/** Size class from the mean total tokens of a job. */
export function sizeClassOf(totalTokens: number, trivialMax: number, standardMax: number): SizeClass {
  if (totalTokens <= trivialMax) return 'trivial';
  if (totalTokens <= standardMax) return 'standard';
  return 'heavy';
}

/** The diurnal peak relative to mean demand (§3.4 step 1 at the peak hour). */
export function peakDemandFactor(diurnalAmplitude: number): number {
  return 1 + diurnalAmplitude;
}
