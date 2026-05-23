/**
 * Spark particle emitter.
 *
 * Spawns short-lived green/yellow specks at a given screen position. Each
 * spark is a body-appended <div> animated via the Web Animation API along
 * a parabolic ballistic path — real `v₀·t + ½·g·t²` physics, randomized
 * initial velocity and angle — then fades out on an ease-in opacity curve.
 *
 * Two callers:
 *   - cursor sparks while a message is typing (narrow up-right fan, small)
 *   - flash bursts during boot (omnidirectional, larger, slower gravity)
 *
 * Each spark is a fire-and-forget body-appended DOM node with ~500-1000ms
 * of life. Reactive Svelte components would re-render on parent state
 * changes and add diff overhead; WAAPI gives GPU-accelerated transforms
 * with zero per-frame JS work after spawn.
 *
 * The .spark base class is defined in index.html (global) so styles apply
 * to body-appended nodes.
 */
import { playSpark, panFromScreenX } from "../audio/sounds";

type SparkColor = { bg: string; glow: string };

const COLORS: SparkColor[] = [
  { bg: "#d4ffaa", glow: "#66ff99" },   // mint
  { bg: "#aaffcc", glow: "#33ff66" },   // terminal green
  { bg: "#fff599", glow: "#ffcc44" },   // hot yellow (accent)
  { bg: "#aaeeff", glow: "#44ccff" },   // cyan (accent)
];

const KEYFRAME_STEPS = 12;

/** Tuning knobs for a single spark. Defaults match the cursor emitter. */
export type SparkOptions = {
  /** Base trajectory angle in radians. -π/2 = up, 0 = right, π/2 = down. */
  baseAngle?: number;
  /** Angle fan width in radians. 2π = omnidirectional. */
  angleSpread?: number;
  /** Initial speed range (px/s). */
  speedMin?: number;
  speedMax?: number;
  /** Lifetime range (ms). */
  lifetimeMin?: number;
  lifetimeMax?: number;
  /** Gravity (px/s²). Lower = floatier. */
  gravity?: number;
  /** Spark size range (px). */
  sizeMin?: number;
  sizeMax?: number;
  /** Horizontal direction multiplier: 1 = right (default), -1 = left. */
  dirX?: number;
  /** Accent-color probability [0,1]. Default 0.15 (yellow/cyan rare). */
  accentChance?: number;
};

const DEFAULTS: Required<SparkOptions> = {
  baseAngle: -Math.PI / 3,
  angleSpread: Math.PI * 0.75,
  speedMin: 50,
  speedMax: 140,
  lifetimeMin: 380,
  lifetimeMax: 700,
  gravity: 320,
  sizeMin: 1,
  sizeMax: 3,
  dirX: 1,
  accentChance: 0.15,
};

/**
 * Spawn a single spark at viewport coordinates (x, y).
 *
 * All parameters are overridable via options. The defaults give the cursor-
 * spark behavior (narrow up-right fan, small green sparks); pass an options
 * object with `angleSpread: 2π` and bigger sizes/speeds for an omnidirectional
 * burst.
 */
export function spawnSpark(x: number, y: number, options: SparkOptions = {}): void {
  if (typeof document === "undefined") return;

  const o = { ...DEFAULTS, ...options };

  const div = document.createElement("div");
  div.className = "spark";

  // Slight jitter at spawn so consecutive sparks don't overlap pixel-perfect.
  const jx = (Math.random() - 0.5) * 4;
  const jy = (Math.random() - 0.5) * 4;
  div.style.left = `${x + jx}px`;
  div.style.top  = `${y + jy}px`;

  const size = o.sizeMin + Math.random() * (o.sizeMax - o.sizeMin);
  div.style.width  = `${size}px`;
  div.style.height = `${size}px`;

  // Mostly green/mint; occasional yellow/cyan accent.
  const c = Math.random() < (1 - o.accentChance)
    ? COLORS[Math.floor(Math.random() * 2)]
    : COLORS[2 + Math.floor(Math.random() * 2)];
  div.style.background = c.bg;
  div.style.boxShadow  = `0 0 4px ${c.glow}, 0 0 8px ${c.glow}55`;

  document.body.appendChild(div);

  const angle = o.baseAngle + (Math.random() - 0.5) * o.angleSpread;
  const speed = o.speedMin + Math.random() * (o.speedMax - o.speedMin);
  const lifetime = o.lifetimeMin + Math.random() * (o.lifetimeMax - o.lifetimeMin);

  const vx = Math.cos(angle) * speed * (o.dirX >= 0 ? 1 : -1);
  const vy0 = Math.sin(angle) * speed;            // negative = upward

  // Sample the projectile path at KEYFRAME_STEPS+1 points and hand off to
  // WAAPI. After this call the browser owns the timeline.
  const keyframes: Keyframe[] = [];
  const lifeSec = lifetime / 1000;
  for (let i = 0; i <= KEYFRAME_STEPS; i++) {
    const u = i / KEYFRAME_STEPS;
    const t = lifeSec * u;
    const dx = vx * t;
    const dy = vy0 * t + 0.5 * o.gravity * t * t;
    // Opacity 1 → 0 with ease-in-cubic — bright most of life, sharp drop
    // at the end. Reads as "burning out".
    const opacity = i === 0 ? 1 : Math.max(0, 1 - u * u * u);
    keyframes.push({ transform: `translate(${dx}px, ${dy}px)`, opacity });
  }

  const anim = div.animate(keyframes, {
    duration: lifetime,
    easing: "linear",
    fill: "forwards",
  });

  const remove = (): void => { div.remove(); };
  anim.finished.then(remove, remove);
}

/**
 * Burst spawn — 1 to 3 sparks at once, weighted toward 1-2. Makes a single
 * cursor emission feel like a real electrical spark rather than a single
 * pixel. Inherits cursor defaults.
 *
 * Also plays a *very subtle* tick sound on ~35% of bursts, panned to
 * the cursor's screen X. Skipping most bursts keeps the audio texture
 * sparse — typing reads as "occasional crackle" rather than a
 * continuous click track. The pan keeps cursor sparks on the left
 * (where the chat sits) panned slightly left.
 */
export function burstSparks(x: number, y: number, dirX = 1): void {
  const count = 1
    + (Math.random() < 0.45 ? 1 : 0)
    + (Math.random() < 0.15 ? 1 : 0);
  for (let i = 0; i < count; i++) spawnSpark(x, y, { dirX });

  if (Math.random() < 0.35 && typeof window !== "undefined") {
    playSpark({ spatial: { type: "stereo", pan: panFromScreenX(x) } });
  }
}

/** Tuning knobs for a contract-close burst. */
export type ContractBurstOptions = {
  /** Number of sparks. Default 28. */
  count?: number;
  /** Intensity multiplier on sizes and speeds. Default 1. */
  intensity?: number;
};

/**
 * Celebratory burst for a "contract closing" moment — the visual punctuation
 * for a deal landing. Omnidirectional spray of larger, floatier sparks with
 * stronger glow than the cursor variant. Reads as confetti at a phosphor-
 * terminal scale: a sustained shower from the center outward, gravity
 * lighter than cursor sparks so the spray hangs in the air briefly.
 *
 * Wired today to status-item completion (red → green) — the closest current
 * analog to a contract close. When real contract gameplay lands, the same
 * primitive will fire on the contract's "closed" event.
 *
 * Also fires a single subtle tick sound panned to the burst's screen X.
 */
export function contractBurst(
  x: number,
  y: number,
  options: ContractBurstOptions = {},
): void {
  const count = options.count ?? 28;
  const k = options.intensity ?? 1;
  for (let i = 0; i < count; i++) {
    spawnSpark(x, y, {
      angleSpread:  Math.PI * 2,     // full 360°
      baseAngle:    0,
      speedMin:     90  * k,
      speedMax:     260 * k,
      lifetimeMin:  650,
      lifetimeMax:  1400,
      gravity:      140,             // floatier than cursor (320) — hangs
      sizeMin:      2,
      sizeMax:      5,
      accentChance: 0.35,            // more yellow/cyan than cursor (0.15)
    });
  }
  if (typeof window !== "undefined") {
    playSpark({ spatial: { type: "stereo", pan: panFromScreenX(x) } });
  }
}

// Boot-flash flares live in motion/flares.ts. Different particle type
// (radial-gradient blooms, no gravity), different visual language. They
// are not sparks.
