/**
 * Fuzzy matcher for the ⌘K palette (plan §4.5, T6). Pure; no DOM.
 *
 * `fuzzyScore(query, text)`:
 *   - case-insensitive subsequence match; 0 when `query` is not a subsequence
 *     of `text`; an empty query matches everything with score 1
 *   - bonuses: +3 when the match starts at index 0 (prefix), +3 per pair of
 *     adjacent matched characters (contiguous run), +1 per matched character
 *     that begins a word (after a space, `-`, `_`, `·`, `/`, `:` or `.`).
 *     Contiguity outweighs the prefix, so `mon` prefers `halberd-monitor`
 *     over `meridian · overnight`, while a prefix still beats a scattered hit
 *   - every alignment that starts at an occurrence of the first query
 *     character is tried greedily and the best one wins, so `sum` against
 *     `east-summarizer` still finds the contiguous run
 *   - ties broken by shorter text: the integer score gets `1 / (1 + len)`
 *     added, which is < 1 and so can never overturn a bonus
 */

const WORD_BREAK = /[\s\-_·/:.]/;

function isWordStart(text: string, i: number): boolean {
  return i === 0 || WORD_BREAK.test(text[i - 1]);
}

/** Greedy left-to-right alignment of `q` in `t` starting at `start`; null when it fails. */
function alignFrom(q: string, t: string, start: number): number[] | null {
  const positions: number[] = [];
  let from = start;
  for (let k = 0; k < q.length; k++) {
    const at = t.indexOf(q[k], from);
    if (at < 0) return null;
    positions.push(at);
    from = at + 1;
  }
  return positions;
}

function scoreAlignment(t: string, positions: number[]): number {
  let score = 1;
  if (positions[0] === 0) score += 3; // prefix
  for (let k = 0; k < positions.length; k++) {
    if (k > 0 && positions[k] === positions[k - 1] + 1) score += 3; // contiguous run
    if (isWordStart(t, positions[k])) score += 1; // word-start hit
  }
  return score;
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 1;
  if (t.length === 0) return 0;

  let best = 0;
  let start = t.indexOf(q[0]);
  while (start >= 0) {
    const positions = alignFrom(q, t, start);
    if (positions === null) break; // no later start can succeed either
    best = Math.max(best, scoreAlignment(t, positions));
    start = t.indexOf(q[0], start + 1);
  }
  if (best === 0) return 0;
  return best + 1 / (1 + t.length); // shorter text wins ties
}

/** Rank `items` by `fuzzyScore` over `text(item)`, dropping non-matches; stable for equal scores. */
export function rank<T>(query: string, items: T[], text: (t: T) => string, limit = 12): T[] {
  const scored = items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.item);
}
