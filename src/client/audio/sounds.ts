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
   Spatial typing
   ──────────────────────────────────────────────────────────────────── */

/**
 * Spatial placement for a sound. Two variants:
 *
 *   stereo  — left/right pan via StereoPannerNode. Cheap, fine for
 *             quick UI sounds (sparks, blips, sentence-end tones).
 *
 *   3d      — full HRTF positioning via PannerNode. Listener sits at
 *             origin facing -Z; sources position themselves in a
 *             normalized -1..1 box mapped from screen coords by
 *             `spatialFromScreen`. Use for moments that benefit
 *             from a real sense of *where on screen* the sound is.
 */
export type Spatial =
  | { type: "stereo"; pan: number }
  | { type: "3d"; x: number; y: number; z?: number };

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

/** Map a viewport pixel column to a stereo pan value in [-1, 1]. */
export function panFromScreenX(
  x: number,
  viewportWidth = window.innerWidth,
): number {
  return Math.max(-1, Math.min(1, (x / viewportWidth) * 2 - 1));
}

/**
 * Map viewport coords to a 3D position for HRTF panning. Listener
 * sits at origin facing -Z; normalized device coords map roughly
 * to a 2×2 plane in front of the listener.
 *
 *   screen top-left   →  ( -1, +1, 0 )
 *   screen centre     →  (  0,  0, 0 )
 *   screen bottom-right → ( +1, -1, 0 )
 */
export function spatialFromScreen(
  x: number,
  y: number,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): Spatial {
  const nx = (x / viewportWidth) * 2 - 1;
  const ny = -((y / viewportHeight) * 2 - 1); // flip Y — screen Y is down, 3D Y is up
  return { type: "3d", x: nx, y: ny, z: 0 };
}

/** Build the right panner node for a Spatial value, or null if not ready. */
function makeSpatialNode(spatial: Spatial | undefined): AudioNode | null {
  const ctx = audioEngine.context;
  if (!ctx || !spatial) return null;
  if (spatial.type === "stereo") {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, spatial.pan));
    return p;
  }
  const p = ctx.createPanner();
  p.panningModel = "HRTF";
  p.distanceModel = "inverse";
  p.refDistance = 1;
  p.maxDistance = 10000;
  p.rolloffFactor = 1;
  p.positionX.value = spatial.x;
  p.positionY.value = spatial.y;
  p.positionZ.value = spatial.z ?? 0;
  return p;
}

/**
 * Wire `source → [panner] → master`. Convenience helper used by every
 * play* function so they don't each duplicate the connection logic.
 */
function connectThroughSpatial(
  source: AudioNode,
  spatial: Spatial | undefined,
  master: GainNode,
): void {
  const panner = makeSpatialNode(spatial);
  if (panner) {
    source.connect(panner);
    panner.connect(master);
  } else {
    source.connect(master);
  }
}

/* ────────────────────────────────────────────────────────────────────
   Spark — short high-frequency tick, optionally panned.
   Used by the cursor spark emitter. Designed to be VERY subtle:
   one tick is barely audible; many in rapid succession give a
   gentle "writing" texture.
   ──────────────────────────────────────────────────────────────────── */

export type SparkOptions = {
  /** Spatial placement. Omit for centred. */
  spatial?: Spatial;
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

  noise.connect(bp);
  bp.connect(env);
  connectThroughSpatial(env, options.spatial, master);

  noise.start(now);
  noise.stop(now + 0.06);
}

/* ────────────────────────────────────────────────────────────────────
   Pop — even shorter than a spark. Highpass noise burst ~30ms total.
   Used for the boot scrim's tiny flicker punchmarks (the failed-
   strike pre-events at 5%, 12%, 60% of the timeline).
   ──────────────────────────────────────────────────────────────────── */

export function playPop(intensity = 0.5, spatial?: Spatial): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = whiteNoiseBuffer(ctx, 0.035, 2);

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.12 * intensity, now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0008, now + 0.035);

  noise.connect(hp);
  hp.connect(env);
  connectThroughSpatial(env, spatial, master);

  noise.start(now);
  noise.stop(now + 0.05);
}

/* ────────────────────────────────────────────────────────────────────
   Electric crack — small filtered noise burst with a slight pitch
   sweep. For the failed-strike moments during boot. More body than
   a spark but still brief.
   ──────────────────────────────────────────────────────────────────── */

export function playCrack(intensity = 0.5, spatial?: Spatial): void {
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
  connectThroughSpatial(env, spatial, master);

  noise.start(now);
  noise.stop(now + 0.25);
}

/* ────────────────────────────────────────────────────────────────────
   Strike — the big "tube catches" sound. Sub-bass thump + bright
   crack, with a touch of room tone (low-Q lowpass on the noise so it
   has air). Used at the final boot flash.
   ──────────────────────────────────────────────────────────────────── */

export function playStrike(intensity = 1, spatial?: Spatial): void {
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
  connectThroughSpatial(subEnv, spatial, master);
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
  connectThroughSpatial(noiseEnv, spatial, master);
  noise.start(now);
  noise.stop(now + 0.2);
}

/* ────────────────────────────────────────────────────────────────────
   Tube hum — low drone with slow LFO modulation. Plays during the
   cathode warm-up phase of boot flicker. Auto-fades in and out so
   the caller just supplies a duration.
   ──────────────────────────────────────────────────────────────────── */

export function playTubeHum(
  durationSec: number,
  intensity = 0.6,
  spatial?: Spatial,
): void {
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
  connectThroughSpatial(env, spatial, master);

  a.start(now);
  b.start(now);
  lfo.start(now);
  const stopAt = now + durationSec + 0.1;
  a.stop(stopAt);
  b.stop(stopAt);
  lfo.stop(stopAt);
}

/* ────────────────────────────────────────────────────────────────────
   Sentence-end tone — small sine blip when the typewriter hits
   '.', '!', or '?'. Pitch varies by terminator. Very low volume
   so it reads as a subtle bell, not a notification.
   ──────────────────────────────────────────────────────────────────── */

export type SentencePunct = "." | "!" | "?";

const SENTENCE_FREQ: Record<SentencePunct, number> = {
  ".": 600,
  "!": 900,
  "?": 1200,
};

export function playSentenceTone(
  kind: SentencePunct = ".",
  spatial?: Spatial,
): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const freq = SENTENCE_FREQ[kind];

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  // Slight pitch droop — feels less "alarm clock", more "thought lands".
  osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + 0.18);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.04, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0005, now + 0.2);

  osc.connect(env);
  connectThroughSpatial(env, spatial, master);

  osc.start(now);
  osc.stop(now + 0.22);
}

/* ────────────────────────────────────────────────────────────────────
   Snap boing — short pitched plosive for the `?` rubber-band snap.
   Played once per question mark on done-mode mount (i.e. when a
   completed message renders). The visual snap loops every ~4s with
   per-instance phase offset; doing audio per-cycle would require
   tracking each `?`'s phase, which is more complex than it's worth.
   ──────────────────────────────────────────────────────────────────── */

export function playSnapBoing(spatial?: Spatial): void {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return;

  const now = ctx.currentTime;

  // Square wave with quick exp pitch sweep down — gives a "boing".
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(350, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

  // Lowpass softens the edges so it's not too harsh.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  lp.Q.value = 1.2;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.06, now + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);

  osc.connect(lp);
  lp.connect(env);
  connectThroughSpatial(env, spatial, master);

  osc.start(now);
  osc.stop(now + 0.11);
}

/* ────────────────────────────────────────────────────────────────────
   Sample loading + playback. For future use — no samples are
   bundled yet, but the helpers exist so dropping a .wav/.mp3 into
   the project becomes trivial.
   ──────────────────────────────────────────────────────────────────── */

const sampleCache = new Map<string, AudioBuffer>();

/**
 * Fetch and decode an audio file. Cached per URL — subsequent calls
 * for the same URL return the same buffer without re-fetching.
 * Returns null if the context isn't live or the fetch failed.
 *
 * Supported formats are whatever the browser's decodeAudioData
 * accepts — WAV, MP3, OGG, FLAC, AAC, etc.
 */
export async function loadSample(url: string): Promise<AudioBuffer | null> {
  const cached = sampleCache.get(url);
  if (cached) return cached;

  const ctx = audioEngine.context;
  if (!ctx) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[audio] sample fetch failed:", url, res.status);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    sampleCache.set(url, buffer);
    return buffer;
  } catch (e) {
    console.warn("[audio] sample decode failed:", url, e);
    return null;
  }
}

export type PlayBufferOptions = {
  /** Per-source gain. Default 1.0 (full). */
  volume?: number;
  /** Stereo pan or 3D position. */
  spatial?: Spatial;
  /** Playback rate. 1.0 = original. 2.0 = octave up. */
  rate?: number;
  /** Loop playback until stop() is called on the returned source. */
  loop?: boolean;
};

/**
 * Schedule a decoded AudioBuffer for playback. Returns the
 * AudioBufferSourceNode so callers can `.stop()` it (for loops) or
 * attach event listeners. Returns null if the engine isn't live.
 */
export function playBuffer(
  buffer: AudioBuffer,
  options: PlayBufferOptions = {},
): AudioBufferSourceNode | null {
  const ctx = audioEngine.context;
  const master = audioEngine.masterNode;
  if (!ctx || !master) return null;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = options.rate ?? 1;
  src.loop = options.loop ?? false;

  const gain = ctx.createGain();
  gain.gain.value = options.volume ?? 1;

  src.connect(gain);
  connectThroughSpatial(gain, options.spatial, master);

  src.start(ctx.currentTime);
  return src;
}
