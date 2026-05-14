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
