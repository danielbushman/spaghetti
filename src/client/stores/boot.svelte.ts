/**
 * Boot phase state. Drives the title color, blinking-light color/cadence, and
 * banner color across the cold → warm → online transition.
 */
export type BootPhase = "idle" | "cold" | "warm" | "online";

class BootStore {
  phase = $state<BootPhase>("idle");

  get online(): boolean {
    return this.phase === "online";
  }
}

export const boot = new BootStore();
