/**
 * Fake "background work" the agent is constantly doing.
 *
 * The agent's anxiety: never be doing nothing. After boot completes,
 * `work.start()` begins rotating through a list of tool names that
 * cycle every 4-10 seconds. The header's ThinkingIndicator shows
 * the current tool whenever the agent isn't actively `busy` (= LLM
 * call in flight); when busy it shows "thinking" instead.
 *
 * No real work is performed — the LLM is not invoked, nothing on
 * disk is touched. This is purely a "looks alive" signal so the
 * operator always sees the agent doing *something*. The tool names
 * use the orchestration/observability vocabulary the game theme
 * implies, with a couple of canon-specific ones.
 */

import { speed } from "./speed.svelte";

const TOOLS: readonly string[] = [
  "scanning logs",
  "querying metrics",
  "checking heartbeats",
  "validating cache",
  "reviewing audit trail",
  "compiling reports",
  "indexing transcripts",
  "pinging clients",
  "watching halberd",
  "throttling queues",
  "updating ledger",
  "syncing state",
  "recalibrating thresholds",
  "crawling docs",
  "diffing schemas",
  "inspecting traces",
  "archiving sessions",
  "normalizing inputs",
  "rotating credentials",
  "mapping dependencies",
  "pruning embeddings",
  "benchmarking endpoints",
  "consolidating findings",
  "verifying signatures",
  "rehearsing handoffs",
  "tracing call graph",
  "auditing trading-ops",
  "monitoring renewal window",
  "warming model cache",
];

class WorkStore {
  active = $state(false);
  tool = $state<string>("");

  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Begin rotating tools. Idempotent — calling start() again no-ops. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.cycle();
  }

  /** Stop the rotation and clear the current tool. */
  stop(): void {
    this.active = false;
    this.tool = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Full reset for the soft-restart flow. Equivalent to stop here. */
  reset(): void {
    this.stop();
  }

  private cycle(): void {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    // Pick a different tool than the current one if possible.
    let next = TOOLS[Math.floor(Math.random() * TOOLS.length)];
    if (this.tool && TOOLS.length > 1) {
      while (next === this.tool) {
        next = TOOLS[Math.floor(Math.random() * TOOLS.length)];
      }
    }
    this.tool = next;
    // 4-10s per tool name, scaled by the global speed setting. Clamped
    // to a 60ms minimum so the label stays readable at extreme speeds —
    // even at 200× the tool name sits long enough to register a flash
    // of legibility rather than blurring entirely.
    const raw = (4_000 + Math.random() * 6_000) * speed.multiplier;
    const duration = Math.max(60, raw);
    this.timer = setTimeout(() => this.cycle(), duration);
  }
}

export const work = new WorkStore();
