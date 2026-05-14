/**
 * Spark particle emitter.
 *
 * Spawns short-lived green/yellow specks at a given screen position. Each
 * spark is a body-appended <div> animated via the Web Animation API along
 * a parabolic ballistic path — real `v₀·t + ½·g·t²` physics, fixed
 * gravity, randomized initial velocity and angle — then fades out on an
 * ease-in opacity curve.
 *
 * Why body-append and not Svelte components: each spark is a fire-and-
 * forget DOM node with ~500ms of life. Reactive components would re-render
 * on every state change and add diff overhead. WAAPI gives us GPU-accelerated
 * transforms with zero per-frame JS work after spawn.
 *
 * Why parabolic physics and not d3-shape: we don't need a smoothed curve
 * through control points, we need projectile motion. Two velocity
 * components + gravity gives a real arc for free.
 *
 * The .spark base class is defined in index.html (global) so styles apply
 * to body-appended nodes.
 */

type SparkColor = { bg: string; glow: string };

const COLORS: SparkColor[] = [
  { bg: "#d4ffaa", glow: "#66ff99" },   // mint
  { bg: "#aaffcc", glow: "#33ff66" },   // terminal green
  { bg: "#fff599", glow: "#ffcc44" },   // hot yellow (accent)
  { bg: "#aaeeff", glow: "#44ccff" },   // cyan (accent)
];

const KEYFRAME_STEPS = 12;
const BASE_ANGLE = -Math.PI / 3;        // ~60° up from horizontal, biased right
const ANGLE_SPREAD = Math.PI * 0.75;    // wide fan
const GRAVITY = 320;                    // px/s² — punchy arc

/**
 * Spawn a single spark at screen coordinates (x, y). Optionally biases the
 * trajectory horizontally with `dirX` ∈ [-1, 1] — +1 fires right (default),
 * -1 fires left. Useful if the cursor is at the end of a right-to-left run.
 */
export function spawnSpark(x: number, y: number, dirX = 1): void {
  if (typeof document === "undefined") return;

  const div = document.createElement("div");
  div.className = "spark";

  // Slight jitter at spawn so consecutive sparks don't overlap pixel-perfect.
  const jx = (Math.random() - 0.5) * 4;
  const jy = (Math.random() - 0.5) * 4;
  div.style.left = `${x + jx}px`;
  div.style.top  = `${y + jy}px`;

  const size = 1 + Math.random() * 2;
  div.style.width  = `${size}px`;
  div.style.height = `${size}px`;

  // 85% terminal green/mint, 15% accent (yellow/cyan).
  const c = Math.random() < 0.85
    ? COLORS[Math.floor(Math.random() * 2)]
    : COLORS[2 + Math.floor(Math.random() * 2)];
  div.style.background = c.bg;
  div.style.boxShadow  = `0 0 4px ${c.glow}, 0 0 8px ${c.glow}55`;

  document.body.appendChild(div);

  // Initial velocity: random angle in a fan around BASE_ANGLE, random speed.
  const angle = BASE_ANGLE + (Math.random() - 0.5) * ANGLE_SPREAD;
  const speed = 50 + Math.random() * 90;        // px/s
  const lifetime = 380 + Math.random() * 320;   // ms

  const vx = Math.cos(angle) * speed * (dirX >= 0 ? 1 : -1);
  const vy0 = Math.sin(angle) * speed;           // negative = upward

  // Generate keyframes by sampling the projectile path at fixed intervals.
  // The arc is computed in pixel units; gravity in px/s² gives a satisfying
  // downward pull over the spark's lifetime.
  const keyframes: Keyframe[] = [];
  const lifeSec = lifetime / 1000;
  for (let i = 0; i <= KEYFRAME_STEPS; i++) {
    const u = i / KEYFRAME_STEPS;
    const t = lifeSec * u;
    const dx = vx * t;
    const dy = vy0 * t + 0.5 * GRAVITY * t * t;
    // Opacity: 1 → 0 with ease-in-cubic so the spark stays visible for most
    // of its life then drops sharply at the end. Reads as "burning out".
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
 * Burst spawn — 1 to 3 sparks at once, weighted toward 1-2. Use this to make
 * a single emission feel like a real electrical spark rather than a single
 * pixel.
 */
export function burstSparks(x: number, y: number, dirX = 1): void {
  const count = 1
    + (Math.random() < 0.45 ? 1 : 0)
    + (Math.random() < 0.15 ? 1 : 0);
  for (let i = 0; i < count; i++) spawnSpark(x, y, dirX);
}
