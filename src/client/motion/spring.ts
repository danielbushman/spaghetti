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

/** Options for the panel-reveal helper. */
export type SpringRevealParams = {
  /**
   * Whether the panel is currently being shown. Flipping from false→true
   * runs the spring forward; true→false runs it in reverse. Defaults to
   * true so a static `use:springReveal` (no params) plays the reveal
   * once on mount and stays put.
   */
  visible?: boolean;
  /** Direction the panel comes from. */
  from?: "left" | "right" | "top" | "bottom";
  /** Distance in px to travel along the chosen axis. Default 20. */
  distance?: number;
  /** Whether to interpolate opacity 0→1 alongside the translate. Default true. */
  fade?: boolean;
  /** Spring config. Default `SPRINGS.noWobble`. Use `pop` for snappy, `wobbly` for playful. */
  config?: SpringConfig;
};

/**
 * Spring-based panel reveal. The same primitive that the future
 * management UI panel will reuse — when that lands, drop the action on
 * the panel root with whatever `from` direction the layout calls for.
 *
 * Used today on the side column (the closest current "panel" surface),
 * replacing its CSS cubic-bezier slide-in. The spring takes as long as
 * the physics says, so a `noWobble` preset feels calm while `pop` or
 * `wobbly` adds personality.
 *
 * As a Svelte action:
 *
 *   <aside use:springReveal={{ visible: scene.sideColumnVisible, from: "right" }}>
 *
 * The action observes `params.visible` across `update` calls; flipping
 * it runs the spring forward or backward.
 *
 * Honors `prefers-reduced-motion`: if set, the element snaps to the
 * target state with no animation.
 */
export function springReveal(
  node: HTMLElement,
  params: SpringRevealParams = {},
): { update(next: SpringRevealParams): void; destroy(): void } {
  const state = {
    visible:  params.visible  ?? true,
    from:     params.from     ?? "right",
    distance: params.distance ?? 20,
    fade:     params.fade     ?? true,
    config:   params.config   ?? SPRINGS.noWobble,
  };

  // Honor prefers-reduced-motion: snap to the target state, never animate.
  // Also snap if rAF isn't available (SSR / bun:test) — `animateSpring`
  // would otherwise throw at the first frame.
  const reduce =
    typeof requestAnimationFrame !== "function" ||
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Current displayed progress: 0 = fully offset and transparent,
  // 1 = at rest position and fully opaque. We persist `current` across
  // visibility flips so a mid-flight cancel resumes from where we are.
  let current = state.visible ? 1 : 0;
  let cancel: (() => void) | null = null;

  function apply(p: number): void {
    const axis = state.from === "left" || state.from === "right" ? "X" : "Y";
    const sign = state.from === "left" || state.from === "top" ? -1 : 1;
    const offset = (1 - p) * state.distance * sign;
    // At full rest (progress exactly 1, no overshoot) clear the inline
    // properties so the element doesn't carry a stacking context
    // forever. Critical for panels that host children with their own
    // z-index escapes (e.g. a `.flashing` status row that needs to lift
    // above a fixed-position overlay).
    if (p === 1) {
      node.style.transform = "";
      if (state.fade) node.style.opacity = "";
      return;
    }
    node.style.transform = `translate${axis}(${offset}px)`;
    if (state.fade) node.style.opacity = String(Math.max(0, Math.min(1, p)));
  }

  function animateTo(target: 0 | 1): void {
    if (cancel) {
      cancel();
      cancel = null;
    }
    if (reduce) {
      current = target;
      apply(target);
      return;
    }
    const start = current;
    const span = target - start;
    if (span === 0) return;
    cancel = animateSpring((sp) => {
      // sp goes 0→1; map to start→target. Allow the spring's transient
      // overshoot to pass through so wobbly presets actually wobble.
      current = start + span * sp;
      apply(current);
    }, state.config);
  }

  // Initial paint — no animation; reveal animates only when visible
  // flips true after mount (or if it started true, we just paint at 1).
  apply(current);

  // If starting hidden, freeze at offset until visible flips true.
  // If starting visible, paint at rest and ride future toggles.

  return {
    update(next: SpringRevealParams) {
      const wasVisible = state.visible;
      // Merge — don't overwrite unspecified keys with undefined.
      if (next.visible  !== undefined) state.visible  = next.visible;
      if (next.from     !== undefined) state.from     = next.from;
      if (next.distance !== undefined) state.distance = next.distance;
      if (next.fade     !== undefined) state.fade     = next.fade;
      if (next.config   !== undefined) state.config   = next.config;

      if (state.visible !== wasVisible) {
        animateTo(state.visible ? 1 : 0);
      } else {
        // Non-visibility param changed — repaint at current progress.
        apply(current);
      }
    },
    destroy() {
      if (cancel) cancel();
    },
  };
}
