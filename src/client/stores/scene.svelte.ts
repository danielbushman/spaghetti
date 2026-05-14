/**
 * Scene state machine.
 *
 * The awakening scene is one beat in a (mostly unbuilt) larger arc. Phases
 * exist so the UI can stage panels and the agent can be given beat-specific
 * instructions without polluting the persistent system prompt.
 *
 *   awakening      — boot is done, agent has opened, operator hasn't engaged
 *   triage_intro   — operator's first message has landed; side column is
 *                    sliding in, telemetry starts ticking, the agent's next
 *                    turn gets the triage addendum
 *   triage         — diagnostics revealed (status items in red); operator
 *                    may pick one (by clicking or by name)
 *   acting         — operator picked something; fix is in flight
 *   open           — first action complete; free chat from here
 */
export type ScenePhase =
  | "awakening"
  | "triage_intro"
  | "triage"
  | "acting"
  | "open";

class SceneStore {
  phase = $state<ScenePhase>("awakening");

  /** Side column should be visible from triage_intro onward. */
  get sideColumnVisible(): boolean {
    return this.phase !== "awakening";
  }
}

export const scene = new SceneStore();
