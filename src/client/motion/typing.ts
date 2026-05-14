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
  if (".!?".includes(ch))   return 160 + Math.random() * 100;
  if (",;:".includes(ch))   return 60  + Math.random() * 55;
  if (ch === "\n")           return 90  + Math.random() * 70;
  if (ch === " ")            return 10  + Math.random() * 18;
  if (Math.random() < 0.015) return 40  + Math.random() * 55; // rare hitch
  return 10 + Math.random() * 12;
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
 * "Thinking" pause — extra delay that fires at specific syntactic positions
 * where a real typist visibly hesitates. Returns ms to add to the base
 * delay (which already includes the standard punctuation pauses).
 *
 * Triggers:
 *
 *   ellipsis complete    — last dot of "..."           always       300-800
 *   em-dash + space      — " — " just typed             always       250-650
 *   post-sentence-start  — 1st-3rd letter of new sent.  8% per chr   180-500
 *   post-comma           — 1st-2nd letter after ", "    5% per chr   120-320
 *   mid-flow word break  — space after non-space        2% per chr   180-460
 *
 * The unconditional triggers (ellipsis, em-dash) are explicit pause signals
 * the LLM already uses for effect, so we honor them every time. The
 * probabilistic triggers (post-sentence, post-comma, mid-flow) compound
 * across positions: roughly ~22% of sentences get a post-start hesitation,
 * ~10% of commas, ~2% of word boundaries. Subtle but registers as character.
 *
 * `recentText` is what's already been typed (m.visible at call time,
 * including the just-emitted ch). The regex anchors look at the trailing
 * pattern to determine syntactic position.
 */
export function thinkingPauseMs(
  ch: string,
  prevCh: string | null,
  recentText: string,
): number {
  // Ellipsis complete: just typed the last "." of "...". Long pause —
  // the writer is gathering thought.
  if (ch === "." && recentText.endsWith("...")) {
    return 300 + Math.random() * 500;
  }

  // Em-dash + space: " — " or " – ". The dash itself implies a break,
  // and the writer almost always pauses before resuming. Unicode covers
  // both em-dash (U+2014) and en-dash (U+2013) in case the LLM emits either.
  if (ch === " " && (prevCh === "—" || prevCh === "–")) {
    return 250 + Math.random() * 400;
  }

  // Post-sentence-start: just typed the 1st, 2nd, or 3rd letter of a new
  // sentence (period/?/! + whitespace + 1-3 word chars at end). The pattern
  // requires the trailing chars to be all \w, so this only fires once per
  // sentence-start window.
  if (/\w/.test(ch) && /[.!?]\s+\w{1,3}$/.test(recentText)) {
    if (Math.random() < 0.08) return 180 + Math.random() * 320;
  }

  // Post-comma: just typed 1st or 2nd letter following ", ". The writer
  // collected thought during the comma; the pause sometimes spills into
  // the start of the next clause.
  if (/\w/.test(ch) && /,\s+\w{1,2}$/.test(recentText)) {
    if (Math.random() < 0.05) return 120 + Math.random() * 200;
  }

  // Random mid-flow think — at a word boundary (space after a word char).
  // Rare enough not to feel like the typewriter is constantly stalling.
  if (ch === " " && prevCh !== null && /\w/.test(prevCh)) {
    if (Math.random() < 0.02) return 180 + Math.random() * 280;
  }

  return 0;
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
