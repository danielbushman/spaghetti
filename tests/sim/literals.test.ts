/**
 * Mechanical guard for the "no magic numbers in step.ts" rule (plan §6, §7 T3).
 *
 * Every numeric literal in src/sim/step.ts must be one of {0, 1, 2, 24, 100, 1e6, 3600};
 * everything else is a `Constants` key. A plain grep cannot enforce this (it matches
 * `hash32`, `fnv1a` and the allowed set), so this test strips comments and string
 * literals and tokenises what is left.
 *
 *   bun test tests/sim/literals.test.ts
 */
import { describe, expect, test } from 'bun:test';

const STEP_PATH = new URL('../../src/sim/step.ts', import.meta.url).pathname;
const ALLOWED = new Set([0, 1, 2, 24, 100, 1e6, 3600]);

/** Remove block comments, line comments and '...' / "..." / `...` string literals. */
export function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

/** Digit runs (with optional fraction and exponent) not preceded by an identifier character or a dot. */
export function numericLiterals(code: string): { text: string; value: number }[] {
  const re = /(?<![A-Za-z0-9_$.])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const out: { text: string; value: number }[] = [];
  for (const m of code.matchAll(re)) out.push({ text: m[0], value: Number(m[0]) });
  return out;
}

describe('src/sim/step.ts numeric literals', () => {
  test('tokeniser ignores identifiers, comments and strings', () => {
    const sample = "const hash32 = fnv1a(x) /* 42 */ + 7; // 99\nconst s = 'k=13' + `${a}55`; const y = 1e6 + 2.5 + 24;";
    const found = numericLiterals(stripCommentsAndStrings(sample)).map((l) => l.text);
    expect(found).toEqual(['7', '1e6', '2.5', '24']);
  });

  test('every numeric literal in step.ts is in {0, 1, 2, 24, 100, 1e6, 3600}', async () => {
    const src = await Bun.file(STEP_PATH).text();
    const literals = numericLiterals(stripCommentsAndStrings(src));
    expect(literals.length).toBeGreaterThan(0);
    const offenders = literals.filter((l) => !ALLOWED.has(l.value)).map((l) => l.text);
    expect(offenders).toEqual([]);
  });
});
