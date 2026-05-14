/**
 * Short-lived UI effects that aren't tied to a scene phase.
 *
 * The flash event is the moment of *awareness* — when a status item
 * first appears, or when its state changes. Visually: the scene dims,
 * the focal item pops toward the camera with a scale-up motion, the
 * BlinkingLight pulses bright. The whole thing lasts ~1.2 seconds —
 * not a quick flash, a sustained "look here" beat.
 *
 * Multiple flashes can overlap (e.g. the three status items revealing
 * one after another with 800ms between them). Each item gets its own
 * spotlight window via `flashingItems`; the overlay scrim stays on
 * for the union of all active windows via a counter.
 */

const FLASH_DURATION_MS = 1200;

class EffectsStore {
  /** True while *any* flash is in progress. Drives the overlay scrim. */
  flashing = $state(false);

  /**
   * Set of item IDs currently being spotlit. Each id is added when
   * flash() is called with it and removed when its individual window
   * expires. Components check `has(item.id)` to decide whether to apply
   * the spotlight + camera-jump styling.
   */
  flashingItems = $state<Set<string>>(new Set());

  private activeCount = 0;
  private timers: Set<ReturnType<typeof setTimeout>> = new Set();

  /**
   * Trigger a flash. With an `itemId`, that item gets its own ~1.2s
   * spotlight window (animation re-fires on each new call for the same
   * id). Without an id, only the overlay scrim activates.
   *
   * Calls can overlap freely — each opens its own timer; the overlay
   * stays on until the last timer expires.
   */
  flash(itemId?: string, durationMs = FLASH_DURATION_MS): void {
    this.flashing = true;
    this.activeCount += 1;
    if (itemId) {
      // Build a new Set so Svelte's $state tracks the mutation reliably.
      const next = new Set(this.flashingItems);
      next.add(itemId);
      this.flashingItems = next;
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.activeCount = Math.max(0, this.activeCount - 1);
      if (itemId) {
        const next = new Set(this.flashingItems);
        next.delete(itemId);
        this.flashingItems = next;
      }
      if (this.activeCount === 0) {
        this.flashing = false;
      }
    }, durationMs);
    this.timers.add(timer);
  }

  stop(): void {
    this.flashing = false;
    this.flashingItems = new Set();
    this.activeCount = 0;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

export const effects = new EffectsStore();
