/**
 * Global animation-speed multiplier.
 *
 * `multiplier` is the value every paced delay in the app multiplies its
 * duration by. multiplier < 1 = faster, > 1 = slower. The UI exposes a
 * `factor` instead (1/multiplier, higher = faster) because that's the
 * intuitive direction.
 *
 * Range: factor 0.5× to 200×. Slow end stays gentle (0.5×); fast end
 * extends to 200× so the whole game can be sped through for testing or
 * impatient play.
 *
 * The model output itself can't be sped — that's bounded by the LLM's
 * inference rate. Everything else (boot pauses, typewriter cadence,
 * silence probes, auto-pick countdowns, work-tool rotation, runway
 * burn, status-flash duration, boot flicker, afterimage) reads this
 * store and scales accordingly.
 */

const KEY = "spaghetti.speed";

/** Slow-end factor (multiplier 2.0). */
export const FACTOR_MIN = 0.5;
/** Fast-end factor (multiplier 0.005). */
export const FACTOR_MAX = 200;

function readStored(): number {
  if (typeof localStorage === "undefined") return 1.0;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 1.0;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(1 / FACTOR_MAX, Math.min(1 / FACTOR_MIN, n));
    }
  } catch {
    /* localStorage may be disabled */
  }
  return 1.0;
}

class SpeedStore {
  multiplier = $state(typeof localStorage !== "undefined" ? readStored() : 1.0);

  /** Set the delay multiplier directly (lower = faster). Clamps + persists. */
  setMultiplier(v: number): void {
    const clamped = Math.max(1 / FACTOR_MAX, Math.min(1 / FACTOR_MIN, v));
    this.multiplier = clamped;
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {
      /* swallow */
    }
  }

  /**
   * Set by speed factor (1× normal, 200× very fast). Clamps then inverts
   * to a delay multiplier internally.
   */
  setFactor(factor: number): void {
    const safe = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor));
    this.setMultiplier(1 / safe);
  }

  /** Current speed factor (1 / multiplier). 1× normal, higher = faster. */
  get factor(): number {
    return 1 / this.multiplier;
  }
}

export const speed = new SpeedStore();
