/**
 * Short-lived UI effects that aren't tied to a scene phase.
 *
 * Currently just `flash` — a sub-second punctuation event triggered when
 * a status item changes state (red → working, working → green). The
 * scene-wide dim and the BlinkingLight's bright pulse both subscribe to
 * `flashing` and react synchronously.
 *
 * Not called when a status item first appears (the off → on transition);
 * the initial reveal is its own visual moment via the staggered slide-in.
 */

const FLASH_DURATION_MS = 350;

class EffectsStore {
  /**
   * True while a flash is in progress. Components read this to dim
   * themselves / pulse brighter / etc. Auto-clears after the duration
   * expires. Multiple flash() calls in quick succession restart the
   * timer (the most recent flash extends the window).
   */
  flashing = $state(false);

  private timer: ReturnType<typeof setTimeout> | null = null;

  flash(durationMs = FLASH_DURATION_MS): void {
    this.flashing = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flashing = false;
      this.timer = null;
    }, durationMs);
  }

  stop(): void {
    this.flashing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const effects = new EffectsStore();
