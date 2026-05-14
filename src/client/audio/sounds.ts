/**
 * Algorithmic sound generators.
 *
 * Everything here is synthesised at play-time from oscillators, noise
 * buffers, and biquad filters — no pre-recorded samples. Each `play*`
 * function builds a tiny audio graph that schedules itself onto the
 * shared AudioContext, runs to completion, and gets GC'd. No need to
 * track or clean up anything from the caller's side.
 *
 * All helpers are no-ops when the AudioContext hasn't been resumed
 * yet (i.e. the operator hasn't dismissed the warning gate), so it's
 * safe to call them unconditionally from the motion system.
 *
 * Spatial: a `pan` parameter in [-1, 1] sets a StereoPannerNode for
 * left/right placement. Sources without a pan default to centred.
 * `panFromScreenX(x)` is a helper that maps a viewport pixel column
 * to a pan value so spark sounds can be positioned where the cursor
 * actually is on screen.
 */
import { audioEngine } from "./engine";

/* ────────────────────────────────────────────────────────────────────
   Internal helpers
   ──────────────────────────────────────────────────────────────────── */

/**
 * Generate a mono buffer of decaying white noise. Used for crackles
 * and impacts. `decay` ∈ [0,1] controls how fast amplitude falls off
 * across the buffer length.
 */
function whiteNoiseBuffer(
  ctx: AudioContext,
  durationSec: number,
  decay = 1,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, decay * 4);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  return buf;
}

/** Map a viewport pixel column to a pan value in [-1, 1]. */
export function panFromScreenX(x: number, viewportWidth = window.innerWidth): number {
  return Math.max(-1, Math.min(1, (x / viewportWidth) * 2 - 1));
}

/** Build a stereo panner node on the engine's context, or null if not ready. */
function makePanner(pan: number | undefined): StereoPannerNode | null {
  const ctx = audioEngine.context;
  if (!ctx) return null;
  if (pan === undefined) return null;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}

/* ────────────────────────────────────────────────────────────────────
   Spark — short high-frequency tick, optionally panned.
   Used by the cursor spark emitter. Designed to be VERY subtle:
   one tick is barely audible; many in rapid succession give a
   gentle "writing" texture.
   ──────────────────────────────────────────────────────────────────── */

export type SparkOptions = {
  /** Stereo pan in [-1, 1]. Omit for centred. */
  pan?: number;
  /** Volume multiplier. Default 0.08 — already quiet. */
  volume?: number;
};

export function playSpark(options: SparkOptions = {}): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const volume = options.volume ?? 0.08;

  // Filtered short noise burst. Random pitch in a "tick" range so
  // consecutive sparks have texture instead of one identical sample.
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, 0.04, 1.2);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4500 + Math.random() * 3500;
  bp.Q.value = 6;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(volume, now + 0.001);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  const panner = makePanner(options.pan);

  noise.connect(bp);
  bp.connect(env);
  if (panner) {
    env.connect(panner);
    panner.connect(master);
  } else {
    env.connect(master);
  }

  noise.start(now);
  noise.stop(now + 0.06);
}

/* ────────────────────────────────────────────────────────────────────
   Electric crack — small filtered noise burst with a slight pitch
   sweep. For the failed-strike moments during boot. More body than
   a spark but still brief.
   ──────────────────────────────────────────────────────────────────── */

export function playCrack(intensity = 0.5): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, 0.18, 1.8);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(2200, now);
  bp.frequency.exponentialRampToValueAtTime(900, now + 0.18);
  bp.Q.value = 4;

  const env = ctx.createGain();
  const peak = 0.18 * intensity;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  noise.connect(bp);
  bp.connect(env);
  env.connect(master);

  noise.start(now);
  noise.stop(now + 0.25);
}

/* ────────────────────────────────────────────────────────────────────
   Strike — the big "tube catches" sound. Sub-bass thump + bright
   crack, with a touch of room tone (low-Q lowpass on the noise so it
   has air). Used at the final boot flash.
   ──────────────────────────────────────────────────────────────────── */

export function playStrike(intensity = 1): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  // Sub-bass body — sine with quick frequency drop for "thump".
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(110, now);
  sub.frequency.exponentialRampToValueAtTime(45, now + 0.18);

  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0, now);
  subEnv.gain.linearRampToValueAtTime(0.35 * intensity, now + 0.005);
  subEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  sub.connect(subEnv);
  subEnv.connect(master);
  sub.start(now);
  sub.stop(now + 0.5);

  // Bright crack — bandpass-filtered noise with rapid decay.
  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, 0.12, 2.2);

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 3;

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0, now);
  noiseEnv.gain.linearRampToValueAtTime(0.22 * intensity, now + 0.002);
  noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  noise.connect(bp);
  bp.connect(noiseEnv);
  noiseEnv.connect(master);
  noise.start(now);
  noise.stop(now + 0.2);
}

/* ────────────────────────────────────────────────────────────────────
   Tube hum — low drone with slow LFO modulation. Plays during the
   cathode warm-up phase of boot flicker. Auto-fades in and out so
   the caller just supplies a duration.
   ──────────────────────────────────────────────────────────────────── */

export function playTubeHum(durationSec: number, intensity = 0.6): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  // Two slightly detuned sines for analog warmth.
  const a = ctx.createOscillator();
  a.type = "sine";
  a.frequency.value = 58;
  const b = ctx.createOscillator();
  b.type = "sine";
  b.frequency.value = 62;

  // Slow vibrato LFO on both — tiny modulation depth.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.8;
  lfo.connect(lfoGain);
  lfoGain.connect(a.frequency);
  lfoGain.connect(b.frequency);

  // Lowpass for warmth.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  lp.Q.value = 0.8;

  // Envelope: 350ms attack, sustain, 500ms release.
  const env = ctx.createGain();
  const peak = 0.06 * intensity;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + 0.35);
  env.gain.setValueAtTime(peak, now + Math.max(0.4, durationSec - 0.5));
  env.gain.linearRampToValueAtTime(0, now + durationSec);

  a.connect(lp);
  b.connect(lp);
  lp.connect(env);
  env.connect(master);

  a.start(now);
  b.start(now);
  lfo.start(now);
  const stopAt = now + durationSec + 0.1;
  a.stop(stopAt);
  b.stop(stopAt);
  lfo.stop(stopAt);
}
