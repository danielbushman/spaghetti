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
