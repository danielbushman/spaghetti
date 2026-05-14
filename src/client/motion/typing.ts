/**
 * Typewriter rhythm. Per-character delay in milliseconds.
 *
 * Mirrors the Python TUI's `_char_delay`: punctuation pauses, letters fly,
 * occasional micro-hitch. The shape isn't picked for realism — it's picked
 * so the agent reads as someone thinking, not a printer.
 */
export function charDelayMs(ch: string): number {
  if (".!?".includes(ch))  return 130 + Math.random() * 90;
  if (",;:".includes(ch))  return 50  + Math.random() * 50;
  if (ch === "\n")          return 70  + Math.random() * 60;
  if (ch === " ")           return 8   + Math.random() * 16;
  if (Math.random() < 0.015) return 40 + Math.random() * 50;
  return 7 + Math.random() * 10;
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
