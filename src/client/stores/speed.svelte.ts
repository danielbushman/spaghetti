/**
 * Global animation-speed multiplier.
 *
 * Every sleep() in the boot sequence, every per-char delay in the
 * typewriter, every fix-flow settle, etc. multiplies its duration by
 * `speed.multiplier`. multiplier < 1 = faster, > 1 = slower.
 *
 * Sticky via localStorage so the operator's preference survives reloads.
 * Clamped to a sane range — the slider goes 0.5×-5× speed (multiplier
 * 0.2-2.0) but we allow the underlying value down to 0.1 and up to 5
 * for safety.
 */

const KEY = "spaghetti.speed";

function readStored(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 1.0;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return Math.max(0.1, Math.min(5.0, n));
  } catch {
    /* localStorage may be disabled (private mode) */
  }
  return 1.0;
}

class SpeedStore {
  multiplier = $state(typeof localStorage !== "undefined" ? readStored() : 1.0);

  /** Set the multiplier directly (lower = faster). Clamps + persists. */
  setMultiplier(v: number): void {
    const clamped = Math.max(0.1, Math.min(5.0, v));
    this.multiplier = clamped;
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {
      /* swallow */
    }
  }

  /**
   * Set by speed *factor*: 1× normal, 2× twice as fast, 5× very fast.
   * Internally inverted to a delay multiplier.
   */
  setFactor(factor: number): void {
    const safe = Math.max(0.2, Math.min(10, factor));
    this.setMultiplier(1 / safe);
  }

  /** Current speed factor (1 / multiplier). 1× normal, higher = faster. */
  get factor(): number {
    return 1 / this.multiplier;
  }
}

export const speed = new SpeedStore();
