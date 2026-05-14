/**
 * Sanity tests for the motion library. Pure-math; no DOM needed.
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import {
  smooth,
  anticipate,
  overshoot,
  swoosh,
  boing,
  bounce,
  breathe,
  linear,
  launch,
  settle,
} from "../src/client/motion/easings";
import { springAt, SPRINGS } from "../src/client/motion/spring";
import {
  lobArc,
  quadBezier,
  cubicBezier,
  catmullRom,
} from "../src/client/motion/arcs";
import {
  adaptiveCharDelayMs,
  charDelayMs,
  rhythmModulator,
  thinkingPauseMs,
  wordBoundaryPauseMs,
} from "../src/client/motion/typing";

describe("easings", () => {
  test("all return 0 at t=0 and 1 at t=1", () => {
    for (const e of [smooth, anticipate, overshoot, swoosh, breathe, linear, launch, settle]) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 5);
    }
  });

  test("monotone easings stay within [0, 1]", () => {
    for (const e of [smooth, breathe, linear, launch, settle, bounce]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const v = e(t);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  test("overshoot exceeds 1 somewhere", () => {
    let saw = false;
    for (let t = 0; t <= 1; t += 0.01) {
      if (overshoot(t) > 1) {
        saw = true;
        break;
      }
    }
    expect(saw).toBe(true);
  });

  test("anticipate dips below 0", () => {
    let saw = false;
    for (let t = 0; t <= 1; t += 0.01) {
      if (anticipate(t) < 0) {
        saw = true;
        break;
      }
    }
    expect(saw).toBe(true);
  });

  test("boing settles at 1 — last sample exact, intermediates may oscillate", () => {
    expect(boing(1)).toBeCloseTo(1, 5);
  });
});

describe("spring", () => {
  test("at t=0 progress is 0", () => {
    expect(springAt(0)).toBeCloseTo(0, 6);
  });

  test("noWobble settles toward 1 with no overshoot", () => {
    let maxSeen = 0;
    for (let t = 0; t <= 4; t += 0.02) {
      const v = springAt(t, SPRINGS.noWobble);
      maxSeen = Math.max(maxSeen, v);
    }
    expect(maxSeen).toBeLessThanOrEqual(1 + 1e-3);
    expect(springAt(4, SPRINGS.noWobble)).toBeCloseTo(1, 2);
  });

  test("wobbly preset overshoots transiently", () => {
    let saw = false;
    for (let t = 0.05; t < 1; t += 0.01) {
      if (springAt(t, SPRINGS.wobbly) > 1) {
        saw = true;
        break;
      }
    }
    expect(saw).toBe(true);
  });

  test("thick preset (over-damped) never overshoots", () => {
    for (let t = 0; t <= 6; t += 0.05) {
      expect(springAt(t, SPRINGS.thick)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

describe("lobArc", () => {
  test("passes through both endpoints", () => {
    const arc = lobArc([0, 0], [10, 0], 5);
    expect(arc(0)).toEqual([0, 0]);
    const end = arc(1);
    expect(end[0]).toBeCloseTo(10);
    expect(end[1]).toBeCloseTo(0);
  });

  test("peak height occurs at midpoint with correct lift", () => {
    const arc = lobArc([0, 0], [10, 0], 5);
    const mid = arc(0.5);
    expect(mid[0]).toBeCloseTo(5);
    expect(mid[1]).toBeCloseTo(-5);
  });
});

describe("quadBezier", () => {
  test("passes through endpoints", () => {
    const c = quadBezier([0, 0], [5, 10], [10, 0]);
    expect(c(0)).toEqual([0, 0]);
    expect(c(1)).toEqual([10, 0]);
  });
});

describe("cubicBezier", () => {
  test("passes through endpoints", () => {
    const c = cubicBezier([0, 0], [3, 10], [7, 10], [10, 0]);
    expect(c(0)).toEqual([0, 0]);
    expect(c(1)).toEqual([10, 0]);
  });
});

describe("typewriter cadence", () => {
  test("base delay is within documented bands", () => {
    const buckets = (ch: string, n = 800) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < n; i++) {
        const d = charDelayMs(ch);
        if (d < min) min = d;
        if (d > max) max = d;
      }
      return { min, max };
    };
    // Letters: 10-22 base, plus rare hitch (40-95). Floor stays tight.
    const letter = buckets("a", 2000);
    expect(letter.min).toBeGreaterThanOrEqual(10);
    expect(letter.min).toBeLessThanOrEqual(22);
    // Sentence terminators are clearly slower than letters.
    const sentence = buckets(".");
    expect(sentence.min).toBeGreaterThanOrEqual(160);
    expect(sentence.max).toBeLessThanOrEqual(260);
  });

  test("adaptive delay is non-increasing as backlog grows", () => {
    const ch = "a";
    const avg = (backlog: number, n = 300) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += adaptiveCharDelayMs(ch, backlog);
      return s / n;
    };
    const a = avg(0);
    const b = avg(5);
    const c = avg(15);
    const d = avg(50);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
    expect(d).toBeLessThan(c);
    expect(d).toBeLessThanOrEqual(3 + 1e-9);
  });

  test("rhythm modulator stays in plausible bounds", () => {
    for (let t = 0; t < 30_000; t += 13) {
      const m = rhythmModulator(t);
      expect(m).toBeGreaterThan(0.83);
      expect(m).toBeLessThan(1.17);
    }
  });

  test("rhythm modulator averages near 1 over many cycles", () => {
    let sum = 0;
    let count = 0;
    // Sample many full periods (primary ~2.8s) to swamp the small overtone.
    for (let t = 0; t < 60_000; t += 7) {
      sum += rhythmModulator(t);
      count++;
    }
    expect(sum / count).toBeCloseTo(1, 1); // ±0.05
  });

  test("thinking pause fires unconditionally after an ellipsis", () => {
    // Last "." of "..." → always returns positive
    for (let i = 0; i < 50; i++) {
      const v = thinkingPauseMs(".", ".", "Well...");
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(900);
    }
  });

  test("thinking pause fires unconditionally after em-dash + space", () => {
    for (let i = 0; i < 50; i++) {
      const v = thinkingPauseMs(" ", "—", "I — ");
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(800);
    }
    // Also handles en-dash
    expect(thinkingPauseMs(" ", "–", "I – ")).toBeGreaterThan(0);
  });

  test("thinking pause is probabilistic at sentence start, mostly silent elsewhere", () => {
    // Sample ~22% of sentences should pause at one of the first 3 letters,
    // so across many independent samples at a sentence-start position, we
    // should see a meaningful but minority rate.
    let sentenceStartHits = 0;
    for (let i = 0; i < 2000; i++) {
      if (thinkingPauseMs("e", "h", "Yes. The") > 0) sentenceStartHits++;
    }
    expect(sentenceStartHits).toBeGreaterThan(80);   // > 4%
    expect(sentenceStartHits).toBeLessThan(400);     // < 20%

    // In normal mid-prose flow (no recent punctuation), the only trigger
    // is the rare word-boundary roll. For a letter (not a space), it
    // should basically never fire.
    let midFlowHits = 0;
    for (let i = 0; i < 2000; i++) {
      if (thinkingPauseMs("e", "n", "agent reply continues") > 0) midFlowHits++;
    }
    expect(midFlowHits).toBe(0);
  });

  test("thinking pause occasionally fires at a word boundary in flow", () => {
    let hits = 0;
    for (let i = 0; i < 5000; i++) {
      if (thinkingPauseMs(" ", "r", "the agent works hard or") > 0) hits++;
    }
    // ~2% expected; bound generously to avoid flake.
    expect(hits).toBeGreaterThan(40);
    expect(hits).toBeLessThan(250);
  });

  test("word-boundary pause fires only after a word", () => {
    // Word-ending space gets a pause; everything else doesn't.
    const hasPause = (ch: string, prev: string | null) => {
      // Several samples since the value is random.
      let sawPositive = false;
      for (let i = 0; i < 40; i++) {
        if (wordBoundaryPauseMs(ch, prev) > 0) { sawPositive = true; break; }
      }
      return sawPositive;
    };
    expect(hasPause(" ", "a")).toBe(true);
    expect(hasPause(" ", ".")).toBe(true);
    expect(wordBoundaryPauseMs("a", "a")).toBe(0);
    expect(wordBoundaryPauseMs(" ", " ")).toBe(0);
    expect(wordBoundaryPauseMs(" ", null)).toBe(0);
    expect(wordBoundaryPauseMs(" ", "\n")).toBe(0);
  });
});

describe("sparks", () => {
  test("burstSparks is a no-op in non-DOM env (no throw)", async () => {
    // The module reads `typeof document` and bails when undefined, so
    // importing and invoking under bun:test (no DOM) must not crash.
    const { burstSparks, spawnSpark } = await import("../src/client/motion/sparks");
    expect(() => burstSparks(0, 0)).not.toThrow();
    expect(() => spawnSpark(10, 20, { dirX: -1 })).not.toThrow();
  });
});

describe("flares", () => {
  test("bloomFlare and flareBurst are no-ops in non-DOM env (no throw)", async () => {
    const { bloomFlare, flareBurst } = await import("../src/client/motion/flares");
    expect(() => bloomFlare(0, 0)).not.toThrow();
    expect(() => bloomFlare(10, 20, { intensity: 2 } as any)).not.toThrow();
    expect(() => flareBurst(0, 0, 5)).not.toThrow();
    expect(() => flareBurst(0, 0, 5, { intensity: 1.8 })).not.toThrow();
  });
});

describe("catmullRom", () => {
  test("passes through each waypoint", () => {
    const points: Array<readonly [number, number]> = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    const path = catmullRom(points);
    expect(path(0)[0]).toBeCloseTo(0);
    expect(path(0)[1]).toBeCloseTo(0);
    expect(path(0.5)[0]).toBeCloseTo(5);
    expect(path(0.5)[1]).toBeCloseTo(5);
    expect(path(0.999999)[0]).toBeCloseTo(10);
  });

  test("rejects degenerate input", () => {
    expect(() => catmullRom([[0, 0]])).toThrow();
  });
});
