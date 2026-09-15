/**
 * Seeded, stateless-by-construction randomness. Plan §3.3 (T1).
 *
 * Noise for sim-hour `h` is a pure function of `(seed, h)`: `forHour(h)`
 * returns a fresh splitmix32 stream seeded by `hash32(seed, h)`, so no RNG
 * state ever lives in `SimState`. That is what makes `step(s, 168)` equal
 * 168 × `step(s, 1)` and replay exact.
 *
 * No ambient randomness: every draw traces back to the seed.
 */

const TWO_32 = 4294967296; // 2^32

/** murmur3 32-bit finaliser (fmix32). */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Hash a sequence of integers to an unsigned 32-bit value: each input is
 * folded in with a golden-ratio increment, then passed through the murmur3
 * finaliser, so `hash32(a, b) !== hash32(b, a)` and `hash32(0, 0) !== 0`.
 */
export function hash32(...ints: number[]): number {
  let h = 0;
  for (const x of ints) {
    h = (h + (x >>> 0) + 0x9e3779b9) >>> 0;
    h = fmix32(h);
  }
  return h >>> 0;
}

/** FNV-1a, 32-bit, over UTF-16 code units. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface HourRng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller, no cached second value). */
  normal(): number;
  /** Log-normal with mean exactly 1: exp(normal()·σ − σ²/2). */
  lognormal(sigma: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Uniform choice from a non-empty array. */
  pick<T>(a: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates); the input is not mutated. */
  shuffle<T>(a: readonly T[]): T[];
}

export interface Rng {
  readonly seed: number;
  /** A fresh stream for sim-hour `h`, independent of any other call. */
  forHour(h: number): HourRng;
  /** A fresh labelled stream (the world generator uses `fork('world')`). */
  fork(label: string): HourRng;
}

/** splitmix32: a 32-bit state stepped by the golden ratio, output mixed. */
function splitmix32(seed: number): HourRng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = z ^ (z >>> 15);
    return (z >>> 0) / TWO_32;
  };

  const normal = (): number => {
    // Box–Muller. u1 ∈ (0, 1] so log() is finite; only the cosine branch is
    // used, so results never depend on call history.
    const u1 = 1 - next();
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  return {
    next,
    normal,
    lognormal: (sigma) => Math.exp(normal() * sigma - (sigma * sigma) / 2),
    int: (n) => Math.floor(next() * n),
    pick: (a) => a[Math.floor(next() * a.length)],
    shuffle: (a) => {
      const out = a.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

export function createRng(seed: number): Rng {
  // `hash32` folds the seed to 32 bits itself; the reported seed is the one given.
  return {
    seed,
    forHour: (h) => splitmix32(hash32(seed, h)),
    fork: (label) => splitmix32(hash32(seed, fnv1a(label))),
  };
}
