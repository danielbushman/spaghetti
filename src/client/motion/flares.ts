/**
 * Bloom flare particles.
 *
 * Different visual language from cursor sparks (motion/sparks.ts):
 *   - sparks  → small (1-3px), narrow up-right fan, gravity drops them
 *               to the floor. Reads as ballistic debris.
 *   - flares  → larger (8-32px+), radial-gradient soft halos,
 *               omnidirectional drift with NO gravity, fast bloom in
 *               then long fade out. Reads as flash residue.
 *
 * Used for the boot-flicker electric flashes. Each flash bursts flares
 * from the top-left corner (the `.light` element area, looked up at
 * burst time so layout changes don't matter), simulating the loading
 * indicator "expelling" light when the tube actually catches.
 *
 * Each flare is a fire-and-forget body-appended <div> animated via the
 * Web Animation API. WAAPI gives GPU-accelerated transforms with zero
 * per-frame JS cost after spawn; the .finished promise removes the
 * node when done.
 *
 * The .flare base class is defined in index.html (global).
 */

type FlareColor = {
  /** White-hot center stop. */
  center: string;
  /** Coloured mid stop. */
  mid: string;
  /** Outer colour at fade-to-transparent. */
  outer: string;
};

const COLORS: FlareColor[] = [
  // mint
  { center: "rgba(255,255,255,1.0)", mid: "rgba(212,255,224,0.85)", outer: "rgba(92,219,168,0.35)" },
  // warm yellow
  { center: "rgba(255,255,255,1.0)", mid: "rgba(255,244,176,0.85)", outer: "rgba(204,170,51,0.35)" },
  // cyan
  { center: "rgba(255,255,255,1.0)", mid: "rgba(221,238,255,0.85)", outer: "rgba(85,153,204,0.35)" },
];

const KEYFRAME_STEPS = 14;

/** Tuning knobs for a single bloom flare. */
export type FlareOptions = {
  /** Random offset radius around the origin so multiple flares don't overlap. */
  spreadRadius?: number;
  /** Starting diameter (px). */
  sizeMin?: number;
  sizeMax?: number;
  /** Scale multiplier at end of life. >1 = grows. */
  scaleMin?: number;
  scaleMax?: number;
  /** Outward drift distance (px). 0 to keep flares in place. */
  driftMin?: number;
  driftMax?: number;
  /** Lifetime (ms). */
  lifetimeMin?: number;
  lifetimeMax?: number;
  /** Drift angle bias (radians); default is 0 (random 360°). */
  baseAngle?: number;
  /** Drift angle spread (radians); default 2π (omnidirectional). */
  angleSpread?: number;
};

const DEFAULTS: Required<FlareOptions> = {
  spreadRadius: 12,
  sizeMin: 10,
  sizeMax: 22,
  scaleMin: 1.8,
  scaleMax: 3.0,
  driftMin: 40,
  driftMax: 130,
  lifetimeMin: 750,
  lifetimeMax: 1400,
  baseAngle: 0,
  angleSpread: Math.PI * 2,
};

/**
 * Spawn one bloom flare at (x, y). The flare's centre starts at the given
 * coordinates and drifts outward at a random angle (within the configured
 * bias) without any gravity.
 */
export function bloomFlare(x: number, y: number, options: FlareOptions = {}): void {
  if (typeof document === "undefined") return;
  const o = { ...DEFAULTS, ...options };

  const div = document.createElement("div");
  div.className = "flare";

  const size = o.sizeMin + Math.random() * (o.sizeMax - o.sizeMin);

  // Random offset from origin so a burst of N flares doesn't collapse
  // into a single hot point. Small radial scatter at spawn.
  const offsetAngle = Math.random() * Math.PI * 2;
  const offsetDist = Math.random() * o.spreadRadius;
  const ox = Math.cos(offsetAngle) * offsetDist;
  const oy = Math.sin(offsetAngle) * offsetDist;

  // Position so the element's centre is at (x + ox, y + oy).
  div.style.left = `${x + ox - size / 2}px`;
  div.style.top  = `${y + oy - size / 2}px`;
  div.style.width  = `${size}px`;
  div.style.height = `${size}px`;

  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  div.style.background = `radial-gradient(circle at center, ${c.center} 0%, ${c.mid} 30%, ${c.outer} 60%, transparent 100%)`;

  document.body.appendChild(div);

  // Outward drift, no gravity. Easing baked into keyframe sampling
  // (easeOutCubic) so the flare moves fast at first then slows.
  const driftAngle = o.baseAngle + (Math.random() - 0.5) * o.angleSpread;
  const driftDist = o.driftMin + Math.random() * (o.driftMax - o.driftMin);
  const dx = Math.cos(driftAngle) * driftDist;
  const dy = Math.sin(driftAngle) * driftDist;

  const endScale = o.scaleMin + Math.random() * (o.scaleMax - o.scaleMin);
  const lifetime = o.lifetimeMin + Math.random() * (o.lifetimeMax - o.lifetimeMin);

  // Opacity profile: 0 → 1 fast bloom over 0..15%, then quadratic fade
  // to 0 over the remaining 85%. Long fade tail sells the "afterglow".
  const BLOOM_END = 0.15;
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= KEYFRAME_STEPS; i++) {
    const u = i / KEYFRAME_STEPS;
    // easeOutCubic for drift and scale — fast then slows.
    const ease = 1 - (1 - u) ** 3;
    const tx = dx * ease;
    const ty = dy * ease;
    const scale = 1 + (endScale - 1) * ease;
    let opacity: number;
    if (u < BLOOM_END) {
      opacity = u / BLOOM_END;
    } else {
      const f = (u - BLOOM_END) / (1 - BLOOM_END);
      opacity = (1 - f) * (1 - f);
    }
    keyframes.push({
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      opacity,
    });
  }

  const anim = div.animate(keyframes, {
    duration: lifetime,
    easing: "linear",
    fill: "forwards",
  });

  const remove = (): void => { div.remove(); };
  anim.finished.then(remove, remove);
}

/** Options for a multi-flare burst. */
export type FlareBurstOptions = FlareOptions & {
  /**
   * Intensity multiplier on size and drift ranges. >1 = bigger burst.
   * Use to scale up bursts for the more important flashes. Doesn't
   * stretch lifetimes — bigger but not longer.
   */
  intensity?: number;
};

/**
 * Burst of `count` bloom flares from the same origin point. Each flare's
 * angle, size, and drift distance is independently randomized within the
 * configured ranges (or defaults scaled by `intensity`).
 */
export function flareBurst(
  x: number,
  y: number,
  count: number,
  options: FlareBurstOptions = {},
): void {
  const intensity = options.intensity ?? 1;
  const scaled: FlareOptions = {
    spreadRadius: (options.spreadRadius ?? DEFAULTS.spreadRadius) * intensity,
    sizeMin: (options.sizeMin ?? DEFAULTS.sizeMin) * intensity,
    sizeMax: (options.sizeMax ?? DEFAULTS.sizeMax) * intensity,
    scaleMin: options.scaleMin ?? DEFAULTS.scaleMin,
    scaleMax: options.scaleMax ?? DEFAULTS.scaleMax,
    driftMin: (options.driftMin ?? DEFAULTS.driftMin) * intensity,
    driftMax: (options.driftMax ?? DEFAULTS.driftMax) * intensity,
    lifetimeMin: options.lifetimeMin ?? DEFAULTS.lifetimeMin,
    lifetimeMax: options.lifetimeMax ?? DEFAULTS.lifetimeMax,
    baseAngle: options.baseAngle ?? DEFAULTS.baseAngle,
    angleSpread: options.angleSpread ?? DEFAULTS.angleSpread,
  };
  for (let i = 0; i < count; i++) bloomFlare(x, y, scaled);
}
