/**
 * "Thought in flight" — a luminous head + fading trail that travels a
 * curved arc between two screen points. Reads as one agent passing an
 * idea to another.
 *
 * Visual:
 *   - A glowing dot (the head) traces a quadratic Bezier from `from` to
 *     `to`, peaking perpendicular to the chord. Bigger arcs use a bigger
 *     peak so long flights bow more than short ones.
 *   - Behind the head a trail builds up via SVG `stroke-dashoffset`. The
 *     trail fades from head-bright to nothing as the head pulls away.
 *   - Both the dot's cx/cy and the dashoffset progress on the same
 *     timeline so the head is always at the leading edge of the trail.
 *
 * Implementation:
 *   - One body-appended <svg> per thought. Fire-and-forget — removes
 *     itself when the animation ends.
 *   - Path geometry from `quadBezier()` in arcs.ts. We sample the path
 *     for SVG once at spawn, then drive `stroke-dashoffset` (WAAPI) and
 *     the head's position (rAF reading quadBezier(t)) over the same
 *     duration. Two animation tracks on the same timeline; they only
 *     need to stay roughly synced, not frame-perfect.
 *   - Easing on the rAF read uses `swoosh` (anticipate-then-overshoot)
 *     so the head pulls back before launching and overshoots the target
 *     before settling, which makes thoughts read as deliberate rather
 *     than linear.
 *
 * The .thought-arc base class is defined in index.html so styles apply
 * to body-appended nodes.
 */
import { quadBezier, type Vec2 } from "./arcs";
import { swoosh } from "./easings";

const SVG_NS = "http://www.w3.org/2000/svg";
const PATH_SAMPLES = 24;

export type ThoughtArcOptions = {
  /**
   * Peak height of the arc, in px. Positive lifts the curve up (smaller
   * y in screen coords). If omitted, derived from chord length so long
   * flights bow more than short ones.
   */
  peak?: number;
  /** Lifetime (ms). Default 700. */
  duration?: number;
  /** Head diameter (px). Default 6. */
  headSize?: number;
  /** Trail width (px). Default 2. */
  trailWidth?: number;
  /** Hex color for the head + trail. Default phosphor green. */
  color?: string;
};

const DEFAULTS: Required<ThoughtArcOptions> = {
  peak: NaN, // sentinel — derived below if not supplied
  duration: 700,
  headSize: 6,
  trailWidth: 2,
  color: "#33ff66",
};

/**
 * Send a thought from screen-space `from` to `to`. Both points are in
 * viewport coordinates (the same coords getBoundingClientRect uses).
 *
 * Returns immediately; the SVG element schedules its own cleanup when
 * the animation finishes (or on cancel via the returned function).
 */
export function flyThought(
  from: Vec2,
  to: Vec2,
  options: ThoughtArcOptions = {},
): () => void {
  if (typeof document === "undefined") return () => {};

  const opts = { ...DEFAULTS, ...options };

  // Peak height: explicit override, else derive from chord length.
  // Short hops get small bows; long ones get tall bows so the curve
  // is visible even across the whole viewport. Capped so cross-screen
  // arcs don't loop into the ceiling.
  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const peak = Number.isFinite(opts.peak) && !Number.isNaN(opts.peak)
    ? opts.peak
    : Math.min(140, Math.max(24, chord * 0.22));

  // Control point: midpoint of the chord, lifted perpendicular to it
  // (rotated 90° counter-clockwise so the bow is "up" relative to the
  // direction of travel).
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const len = chord || 1;
  const nx = -(to[1] - from[1]) / len;
  const ny =  (to[0] - from[0]) / len;
  const control: Vec2 = [mx + nx * peak, my + ny * peak];

  const path = quadBezier(from, control, to);

  // Sample the path once for the SVG `d` attribute. We use M + a chain
  // of L segments rather than a single Q because we want the dashoffset
  // trail to track the *same* parameterization the head uses.
  const samples: Vec2[] = [];
  for (let i = 0; i <= PATH_SAMPLES; i++) samples.push(path(i / PATH_SAMPLES));
  const d = samples
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");

  // SVG sized to cover the viewport; the path uses absolute viewport
  // coords, and the SVG itself is positioned at (0, 0) of the body.
  // That makes from/to coordinates work as-is without any transform.
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "thought-arc");
  svg.setAttribute("width", String(window.innerWidth));
  svg.setAttribute("height", String(window.innerHeight));
  svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);

  const trail = document.createElementNS(SVG_NS, "path");
  trail.setAttribute("d", d);
  trail.setAttribute("fill", "none");
  trail.setAttribute("stroke", opts.color);
  trail.setAttribute("stroke-width", String(opts.trailWidth));
  trail.setAttribute("stroke-linecap", "round");
  trail.style.filter = `drop-shadow(0 0 4px ${opts.color}) drop-shadow(0 0 8px ${opts.color}88)`;

  // Approximate path length for the dash trick. The browser's
  // getTotalLength() works on <path>, but only after it's in the DOM,
  // and we want to set up the WAAPI animation in one go. Summing
  // segment lengths from our samples is close enough for visual
  // purposes — the trail is the same shape either way; the dash math
  // only affects how the line draws in.
  let pathLen = 0;
  for (let i = 1; i < samples.length; i++) {
    pathLen += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
  }
  trail.setAttribute("stroke-dasharray", String(pathLen));
  trail.setAttribute("stroke-dashoffset", String(pathLen));

  const head = document.createElementNS(SVG_NS, "circle");
  head.setAttribute("r", String(opts.headSize / 2));
  head.setAttribute("cx", String(from[0]));
  head.setAttribute("cy", String(from[1]));
  head.setAttribute("fill", "#ffffff");
  head.style.filter = `drop-shadow(0 0 6px ${opts.color}) drop-shadow(0 0 14px ${opts.color}cc)`;

  svg.appendChild(trail);
  svg.appendChild(head);
  document.body.appendChild(svg);

  // WAAPI for the trail's draw-in. Easing matches swoosh's general
  // shape — back-in-out — via CSS-friendly cubic-bezier so the trail
  // builds with the same "anticipate then overshoot" feel the head
  // gets from its rAF read of swoosh().
  const trailAnim = trail.animate(
    [
      { strokeDashoffset: String(pathLen),  opacity: 1 },
      { strokeDashoffset: String(pathLen * 0.05), opacity: 1, offset: 0.85 },
      { strokeDashoffset: "0",              opacity: 0 },
    ],
    {
      duration: opts.duration,
      easing: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", // back-in-out
      fill: "forwards",
    },
  );

  // Head position driven from quadBezier(t). swoosh() (back-in-out)
  // makes t pull back before launching and overshoot before settling,
  // so the thought feels deliberate rather than mechanical.
  let cancelled = false;
  let raf = 0;
  const t0 = performance.now();
  function tick(now: number): void {
    if (cancelled) return;
    const elapsed = now - t0;
    const u = Math.min(1, elapsed / opts.duration);
    const eased = swoosh(u);
    // Allow tiny overshoot/undershoot in the read — the head visibly
    // overshoots the target before settling, which sells the "arrival".
    const clamped = Math.max(-0.02, Math.min(1.02, eased));
    // quadBezier samples outside [0, 1] cleanly (just extrapolates),
    // so the small overshoot reads as a believable trajectory.
    const [x, y] = path(Math.max(0, Math.min(1, clamped)));
    head.setAttribute("cx", x.toFixed(2));
    head.setAttribute("cy", y.toFixed(2));

    // Head fades out in the last 15% so trail and head both vanish at
    // arrival rather than the head sticking around.
    if (u > 0.85) {
      head.setAttribute("opacity", String(Math.max(0, 1 - (u - 0.85) / 0.15)));
    }

    if (u < 1) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  const remove = (): void => { svg.remove(); };
  trailAnim.finished.then(remove, remove);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    trailAnim.cancel();
    svg.remove();
  };
}

/**
 * Fly a thought from one element's center to another's. Convenience
 * wrapper around `flyThought` for the common "DOM node to DOM node"
 * case — most callers in app code have elements, not coordinates.
 *
 * No-op if either element isn't present (callers may pass a query
 * result that hasn't mounted yet).
 */
export function flyThoughtBetween(
  fromEl: Element | null | undefined,
  toEl: Element | null | undefined,
  options: ThoughtArcOptions = {},
): () => void {
  if (!fromEl || !toEl) return () => {};
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  return flyThought(
    [a.left + a.width / 2, a.top + a.height / 2],
    [b.left + b.width / 2, b.top + b.height / 2],
    options,
  );
}
