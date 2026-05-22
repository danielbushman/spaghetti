/**
 * Robert Penner's easing equations (via d3-ease) re-exported with cartoon /
 * game-feel aliases. Each easing is `(t: 0..1) => 0..1` (occasionally outside
 * that range for overshoot / elastic).
 *
 * The canon this draws from:
 *
 *  - Robert Penner, "Programming Macromedia Flash MX" (2002): the original
 *    linear/quad/cubic/quart/quint/sine/expo/circ/back/elastic/bounce set
 *    with In/Out/InOut variants. Public domain, baked into d3-ease.
 *
 *  - Disney's "12 basic principles of animation" (Thomas & Johnston, 1981):
 *    squash & stretch, anticipation, follow-through, arcs, slow in / slow out,
 *    exaggeration. The principles map cleanly onto easings — anticipation
 *    becomes easeBackIn, follow-through becomes easeBackOut, etc.
 *
 *  - Game-feel writing (Steve Swink's "Game Feel"; Jan Willem Nijman's GDC
 *    talk "The art of screenshake"): the idea that motion sells a system
 *    more than the underlying logic does. None of these are libraries; they
 *    inform the *naming* below so the call site reads like intent.
 *
 * If you want a different curve, import from "d3-ease" directly — it has the
 * full Penner set under names like `easeQuadInOut`, `easeExpoOut`, etc.
 */
import {
  easeLinear,
  easeCubicIn,
  easeCubicOut,
  easeCubicInOut,
  easeBackIn,
  easeBackOut,
  easeBackInOut,
  easeElasticOut,
  easeBounceOut,
  easeSinInOut,
} from "d3-ease";

export type Easing = (t: number) => number;

/** Constant speed. */
export const linear: Easing = easeLinear;

/** Fast start, slow end. Things being released. */
export const launch: Easing = easeCubicOut;

/** Slow start, fast end. Things being built up to a snap. */
export const settle: Easing = easeCubicIn;

/** Slow both ends. The default UI easing. */
export const smooth: Easing = easeCubicInOut;

/** Sine in/out. Good for breathing / pulsing loops. */
export const breathe: Easing = easeSinInOut;

/** Pulls back below 0 before launching forward — anticipation. */
export const anticipate: Easing = easeBackIn;

/** Shoots past 1 and settles back — follow-through / arrive-with-snap. */
export const overshoot: Easing = easeBackOut;

/** Anticipate then overshoot, in one go. */
export const swoosh: Easing = easeBackInOut;

/** Elastic, multiple oscillations decaying — squash & stretch arrival. */
export const boing: Easing = easeElasticOut;

/** Ball-bounces-on-ground — gravity-flavored settle. */
export const bounce: Easing = easeBounceOut;
