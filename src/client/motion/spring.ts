/**
 * Analytic spring solver.
 *
 * A mass on a spring obeys  m·x'' + c·x' + k·(x − x_target) = 0  where
 *   m = mass, c = damping, k = stiffness.
 *
 * Springs feel more alive than fixed-duration easings because they take as
 * long as the physics says they should — a small displacement settles fast,
 * a large one takes longer. The cost is you give up exact duration control.
 *
 * Three regimes (selected by the damping ratio ζ = c / 2√(mk)):
 *   ζ < 1   under-damped     oscillates (overshoot), decays
 *   ζ = 1   critically damped fastest non-oscillating settle
 *   ζ > 1   over-damped       sluggish, no overshoot
 *
 * Returns a value in [0, ~1], where 0 = at rest, 1 = at target. May exceed
 * 1 transiently when under-damped (that's the spring "ringing").
 *
 * References:
 *  - "Physically Based Motion" — Apple HIG / WWDC 2018 (spring concepts).
 *  - react-spring's defaults (stiffness 170 / damping 26) are baked in below.
 *  - Popmotion's tween-to-spring tables, if you want to map a duration target.
 */
export type SpringConfig = {
  stiffness?: number;
  damping?: number;
  mass?: number;
};

/** Sample the unit-step response of a spring at time `t` (seconds). */
export function springAt(
  t: number,
  { stiffness = 170, damping = 26, mass = 1 }: SpringConfig = {},
): number {
  if (t <= 0) return 0;
  if (mass <= 0 || stiffness <= 0) throw new Error("springAt: mass and stiffness must be > 0");

  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    // Under-damped: oscillation with exponential decay envelope.
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * w0 * t);
    return (
      1 -
      envelope *
        (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    );
  }
  if (zeta === 1) {
    // Critically damped: no oscillation, fastest non-oscillating settle.
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  // Over-damped: two real exponential roots.
  const root = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * zeta + root;
  const r2 = -w0 * zeta - root;
  const A = r2 / (r2 - r1);
  const B = -r1 / (r2 - r1);
  return 1 - (A * Math.exp(r1 * t) + B * Math.exp(r2 * t));
}

/** Common spring presets, named for what they feel like. */
export const SPRINGS: Record<string, SpringConfig> = {
  /** Snappy and slightly bouncy. Good for icon pops, toast arrivals. */
  pop:      { stiffness: 300, damping: 18, mass: 1 },
  /** Loose, character-y. Default for "playful" motion. */
  wobbly:   { stiffness: 180, damping: 12, mass: 1 },
  /** Weighty. Settles deliberately. */
  thick:    { stiffness: 280, damping: 60, mass: 1.5 },
  /** Critically damped, no overshoot — UI motion that wants to feel calm. */
  noWobble: { stiffness: 170, damping: 26, mass: 1 },
};

/**
 * Run a spring on a callback until it has effectively settled. Calls
 * `onTick(progress)` each frame. Returns a cancel function.
 *
 * "Settled" = velocity stays small for several frames in a row. For tightly
 * damped springs this is the natural end; for wobbly springs it lets us
 * stop polling once the ring is below the perceptual threshold.
 */
export function animateSpring(
  onTick: (progress: number) => void,
  config: SpringConfig = SPRINGS.noWobble,
): () => void {
  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();
  let lastProgress = 0;
  let stillFrames = 0;

  function frame(now: number) {
    if (cancelled) return;
    const t = (now - t0) / 1000;
    const p = springAt(t, config);
    onTick(p);
    if (Math.abs(p - lastProgress) < 1e-4 && t > 0.2) {
      stillFrames++;
      if (stillFrames > 6) {
        onTick(1);
        return;
      }
    } else {
      stillFrames = 0;
    }
    lastProgress = p;
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
