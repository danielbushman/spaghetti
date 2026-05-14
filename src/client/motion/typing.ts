/**
 * Typewriter rhythm. Per-character delay in milliseconds.
 *
 * Three layers shape the cadence; this function owns only the first (the
 * raw per-character shape). The display loop in chat.svelte.ts combines it
 * with `rhythmModulator` (slow breath) and `wordBoundaryPauseMs` (word-end
 * beat) for the final delay.
 *
 * Base shape — punctuation pauses, letters fly, occasional micro-hitch.
 * Tuned to ~70 chars/sec on letters: slightly slower than a hard typist,
 * fast enough to read as fluency rather than as deliberation.
 */
export function charDelayMs(ch: string): number {
  if (".!?".includes(ch))   return 140 + Math.random() * 90;
  if (",;:".includes(ch))   return 50  + Math.random() * 50;
  if (ch === "\n")           return 80  + Math.random() * 70;
  if (ch === " ")            return 8   + Math.random() * 16;
  if (Math.random() < 0.015) return 35  + Math.random() * 50; // rare hitch
  return 8 + Math.random() * 12;
}

/**
 * Slow ebb and flow on the typing rate. Returns a multiplier (≈ 0.86–1.14)
 * applied to each per-character delay so the cadence "breathes" across a
 * message instead of feeling metronomic.
 *
 * Two detuned sine oscillators, primary period ~2.8s and a smaller ~4.7s
 * over-tone. Mean is exactly 1, so the average message time is unchanged —
 * we're only shifting *when* the slow and fast spots land. Amplitude is
 * deliberately small so the rhythm is felt rather than seen as stuttering.
 */
export function rhythmModulator(nowMs: number): number {
  const fast = Math.sin(nowMs / 446);   // ~2.8s period
  const slow = Math.sin(nowMs / 743);   // ~4.7s period
  return 1 + 0.12 * fast + 0.03 * slow;
}

/**
 * Tiny extra beat on the space that follows a word. Returns 0 at start of
 * text, on consecutive spaces, and after newlines.
 *
 * Stacks on the base space delay (8-24ms), so a word-ending space ends up
 * around 16-50ms. Just enough that prose reads as words-with-spaces instead
 * of one continuous run, without the pause becoming perceptible as a beat
 * in its own right.
 */
export function wordBoundaryPauseMs(ch: string, prevCh: string | null): number {
  if (ch !== " ") return 0;
  if (prevCh === null || prevCh === " " || prevCh === "\n") return 0;
  return 8 + Math.random() * 18;
}

/**
 * Backlog-aware typewriter delay. Use when characters are arriving from a
 * stream and the producer might outrun the display.
 *
 * `backlog` is the number of characters already in `target` but not yet in
 * `visible` *after* the current char is consumed. When backlog is small the
 * natural rhythm wins; when it grows, we scale the delay down so the cursor
 * doesn't lag perceptibly behind the model's output. The thresholds were
 * picked so that:
 *
 *   - On a CPU-bound model that's slower than typing (backlog stays near 0),
 *     cadence is unchanged — it still reads as the agent thinking.
 *   - On a GPU-fast model where Ollama produces 100+ chars/sec, the buffer
 *     fills and we shift into a "catch up" mode rather than artificially
 *     throttling the response.
 *   - At extreme backlog (long stretch produced while we were on a slow
 *     letter), we floor at 3ms — fast flush so the user sees the result.
 *
 *   backlog ≤ 2    natural pace
 *   3..8           60% of base
 *   9..20          30% of base
 *   > 20           min(base × 0.1, 3ms)
 */
export function adaptiveCharDelayMs(ch: string, backlog: number): number {
  const base = charDelayMs(ch);
  if (backlog <= 2)  return base;
  if (backlog <= 8)  return base * 0.6;
  if (backlog <= 20) return base * 0.3;
  return Math.min(base * 0.1, 3);
}
