/**
 * A/B compare store. Pairs with the replay loop to alternate sound
 * (and eventually visual) variants between successive loop cycles —
 * the operator can hear A, then B, then A, then B, swapping per
 * cycle until they're satisfied which they prefer.
 *
 *   mode     — "off" | "active". A/B comparison is only meaningful
 *              while a loop is set; the RestartButton menu disables
 *              the toggle when no loop is active.
 *   current  — "A" | "B". The variant being played in the *current*
 *              loop cycle. Flipped by the App's loop tick *before*
 *              firing the auto-restart, so the new cycle hears the
 *              new variant from the top.
 *
 * Audio modules consume this by accepting an opt-in `variant`
 * parameter; BootFlicker (and any other cue site) reads the current
 * variant at fire time and threads it through.
 *
 * Persisted via localStorage so reloads keep the mode + last-known
 * variant (handy when you reload to pick up a code change).
 */

const KEY_MODE = "spaghetti.abtest.mode";
const KEY_CURRENT = "spaghetti.abtest.current";

type ABMode = "off" | "active";
type ABSide = "A" | "B";

function readMode(): ABMode {
  if (typeof localStorage === "undefined") return "off";
  try {
    return localStorage.getItem(KEY_MODE) === "active" ? "active" : "off";
  } catch {
    return "off";
  }
}

function readCurrent(): ABSide {
  if (typeof localStorage === "undefined") return "A";
  try {
    return localStorage.getItem(KEY_CURRENT) === "B" ? "B" : "A";
  } catch {
    return "A";
  }
}

class ABTestStore {
  mode = $state<ABMode>(readMode());
  current = $state<ABSide>(readCurrent());

  enable(): void {
    this.mode = "active";
    // Always begin a fresh A/B session on A so the first cycle the
    // operator sees is the baseline. Subsequent loop ticks flip.
    this.current = "A";
    this.persist();
  }

  disable(): void {
    this.mode = "off";
    this.persist();
  }

  flip(): void {
    this.current = this.current === "A" ? "B" : "A";
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY_MODE, this.mode);
      localStorage.setItem(KEY_CURRENT, this.current);
    } catch {
      /* ignore */
    }
  }
}

export const abtest = new ABTestStore();
