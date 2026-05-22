/**
 * Parametric 2D paths for arc motion.
 *
 * Cartoon and game motion almost never travels in straight lines. Disney's
 * "arcs" principle says the eye reads curved paths as natural — a thrown
 * object lobs, a hand reaches, a head turn traces a circle. This module
 * gives you a handful of curve generators that all return `(t: 0..1) => [x, y]`.
 *
 * Coordinate convention: screen coords (y grows downward).
 *
 * Each generator is allocation-free at call time — the returned closure
 * captures the math and just does arithmetic per `t`.
 */

export type Vec2 = readonly [number, number];

/**
 * Parabolic lob from `from` to `to`, peaking `peakHeight` above the chord.
 * Positive `peakHeight` arcs upward in screen coordinates (smaller y).
 *
 *      *  ← peak
 *     / \
 *    /   \
 *  from   to
 */
export function lobArc(from: Vec2, to: Vec2, peakHeight: number): (t: number) => Vec2 {
  const [x0, y0] = from;
  const [x1, y1] = to;
  return (t) => {
    const x = x0 + (x1 - x0) * t;
    const yLine = y0 + (y1 - y0) * t;
    const lift = -4 * peakHeight * t * (1 - t); // parabola; max magnitude at t=0.5
    return [x, yLine + lift];
  };
}

/** Quadratic Bezier: p0 → control → p1. One bend. */
export function quadBezier(p0: Vec2, control: Vec2, p1: Vec2): (t: number) => Vec2 {
  return (t) => {
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * control[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * control[1] + t * t * p1[1],
    ];
  };
}

/**
 * Cubic Bezier: p0 → c1, c2 → p1. The workhorse of curve design — CSS's
 * `cubic-bezier(...)` easing is exactly this with axis-aligned endpoints.
 */
export function cubicBezier(
  p0: Vec2,
  c1: Vec2,
  c2: Vec2,
  p1: Vec2,
): (t: number) => Vec2 {
  return (t) => {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    return [
      uuu * p0[0] + 3 * uu * t * c1[0] + 3 * u * tt * c2[0] + ttt * p1[0],
      uuu * p0[1] + 3 * uu * t * c1[1] + 3 * u * tt * c2[1] + ttt * p1[1],
    ];
  };
}

/**
 * Catmull–Rom spline through a sequence of waypoints. The curve passes
 * through each point (unlike Bezier control points which only pull).
 *
 * `tension` ∈ [0, 1]:
 *   0   → standard Catmull-Rom, smooth and slightly loose
 *   0.5 → uniform Catmull-Rom (default), tighter
 *   1   → straight-line segments (degenerate)
 *
 * Good for paths drawn from a stream of recorded positions, or for
 * artist-friendly waypoint editing.
 */
export function catmullRom(
  points: ReadonlyArray<Vec2>,
  tension = 0.5,
): (t: number) => Vec2 {
  if (points.length < 2) {
    throw new Error("catmullRom: need at least 2 points");
  }
  const segs = points.length - 1;
  const scale = 2 - 2 * tension; // 2 when tension=0, 0 when tension=1

  return (t) => {
    if (t >= 1) return points[points.length - 1];
    const clamped = Math.max(0, t);
    const u = clamped * segs;
    const i = Math.floor(u);
    const localT = u - i;

    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const t2 = localT * localT;
    const t3 = t2 * localT;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + localT;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const m1x = scale === 0 ? 0 : (p2[0] - p0[0]) / scale;
    const m1y = scale === 0 ? 0 : (p2[1] - p0[1]) / scale;
    const m2x = scale === 0 ? 0 : (p3[0] - p1[0]) / scale;
    const m2y = scale === 0 ? 0 : (p3[1] - p1[1]) / scale;

    return [
      h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x,
      h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y,
    ];
  };
}
