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
   * themselves / pulse brighter / etc. Auto-clears after the duration.
   */
  flashing = $state(false);

  /**
   * Optional ID of the item being focused by the flash (e.g. the
   * status item that just changed state). Components check this to
   * decide whether they should "spotlight" themselves while the
   * scene dims around them.
   */
  flashingItemId = $state<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Trigger a flash. Pass an `itemId` to mark a specific element as
   * the focal point; components observing `flashingItemId` can pop
   * brighter when their id matches. Multiple flash() calls in quick
   * succession restart the timer (most recent flash wins).
   */
  flash(itemId?: string, durationMs = FLASH_DURATION_MS): void {
    this.flashing = true;
    this.flashingItemId = itemId ?? null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flashing = false;
      this.flashingItemId = null;
      this.timer = null;
    }, durationMs);
  }

  stop(): void {
    this.flashing = false;
    this.flashingItemId = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const effects = new EffectsStore();
