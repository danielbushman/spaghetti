/**
 * Replay-loop store. Captures a wall-clock elapsed-since-run-start
 * timestamp; the App's tick fires a soft-restart every time the live
 * elapsed crosses that marker so the same moment plays over and over.
 *
 * Useful while iterating on a specific boot beat, animation, or sound
 * cue — set the loop, tweak code/CSS, watch it repeat hands-free.
 *
 * Persisted via localStorage so the loop survives real reloads (HMR,
 * tab refresh, etc). The runStartMs reference resets on every soft
 * restart and is *not* persisted (page-load is a fresh run-start).
 */

const KEY_TARGET = "spaghetti.loop.targetMs";

function readTarget(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_TARGET);
    if (!raw) return null;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return null;
}

class LoopStore {
  /** Captured elapsed-ms-from-run-start at which to auto-restart. */
  targetMs = $state<number | null>(readTarget());

  /**
   * Wall-clock timestamp of the most recent run start. Not persisted —
   * a real reload counts as a fresh run, but it picks up the same
   * persisted target.
   */
  runStartMs: number | null = null;

  /** Convenience: is a loop currently configured. */
  get active(): boolean {
    return this.targetMs !== null;
  }

  /** Mark this instant as the start of the current run. */
  markRunStart(): void {
    this.runStartMs = Date.now();
  }

  /** Wall-clock ms since the most recent run start, or 0 if not started. */
  getElapsed(): number {
    if (this.runStartMs === null) return 0;
    return Date.now() - this.runStartMs;
  }

  /**
   * Capture the current elapsed time as the loop point. The next
   * time the live run crosses that mark, the App's tick will fire
   * a restart and start over.
   */
  setLoopToHere(): void {
    const elapsed = this.getElapsed();
    // Guard against capturing a useless near-zero marker (looping
    // after 12ms would just hammer the restart in a tight loop).
    const ms = Math.max(elapsed, 500);
    this.targetMs = ms;
    try {
      localStorage.setItem(KEY_TARGET, String(ms));
    } catch {
      /* ignore */
    }
  }

  /** Disable looping; the next restart is one-shot again. */
  clearLoop(): void {
    this.targetMs = null;
    try {
      localStorage.removeItem(KEY_TARGET);
    } catch {
      /* ignore */
    }
  }
}

export const loop = new LoopStore();
