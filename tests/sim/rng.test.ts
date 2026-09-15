/**
 * Seeded RNG contract (plan §3.3, §6 T1).
 *
 *   bun test tests/sim/rng.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { createRng, fnv1a, hash32 } from '../../src/sim/rng';

const draw = (seed: number, hour: number, n: number): number[] => {
  const r = createRng(seed).forHour(hour);
  return Array.from({ length: n }, () => r.next());
};

describe('hash32 / fnv1a', () => {
  test('are unsigned 32-bit and deterministic', () => {
    for (const v of [hash32(7, 12), hash32(0, 0), hash32(-1), fnv1a('world'), fnv1a('')]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
    expect(hash32(7, 12)).toBe(hash32(7, 12));
    expect(fnv1a('world')).toBe(fnv1a('world'));
  });

  test('order and content matter', () => {
    expect(hash32(7, 12)).not.toBe(hash32(12, 7));
    expect(hash32(7, 12)).not.toBe(hash32(7, 13));
    expect(hash32(0, 0)).not.toBe(0);
    expect(fnv1a('world')).not.toBe(fnv1a('World'));
  });

  test('fnv1a matches the reference vector', () => {
    // FNV-1a 32-bit of "a" is the published test vector.
    expect(fnv1a('a')).toBe(0xe40c292c);
  });
});

describe('createRng', () => {
  test('same seed → same sequence; different seed → different sequence', () => {
    expect(draw(7, 12, 16)).toEqual(draw(7, 12, 16));
    expect(draw(7, 12, 16)).not.toEqual(draw(8, 12, 16));
    expect(draw(7, 12, 16)).not.toEqual(draw(7, 13, 16));
    expect(createRng(7).seed).toBe(7);
  });

  test('forHour(12) is independent of whether forHour(11) ran', () => {
    const fresh = createRng(7).forHour(12).next();

    const rng = createRng(7);
    const h11 = rng.forHour(11);
    h11.next();
    h11.normal();
    h11.lognormal(0.5);
    expect(rng.forHour(12).next()).toBe(fresh);

    // And independent of how many hour-12 streams were already opened.
    rng.forHour(12).next();
    expect(rng.forHour(12).next()).toBe(fresh);
  });

  test('fork(label) is stable and distinct from any hour stream', () => {
    const a = createRng(7).fork('world');
    const b = createRng(7).fork('world');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(createRng(7).fork('world').next()).not.toBe(createRng(7).fork('other').next());
    expect(createRng(7).fork('world').next()).not.toBe(createRng(7).forHour(0).next());
  });

  test('next() is uniform in [0, 1)', () => {
    const n = 20_000;
    const buckets = new Array(10).fill(0) as number[];
    let sum = 0;
    for (let h = 0; h < 20; h++) {
      const r = createRng(3).forHour(h);
      for (let i = 0; i < n / 20; i++) {
        const u = r.next();
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(1);
        buckets[Math.floor(u * 10)] += 1;
        sum += u;
      }
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const count of buckets) {
      // Each decile holds ≈ n/10 = 2000; ±10% is ~7σ for a fair source.
      expect(count).toBeGreaterThan(n * 0.09);
      expect(count).toBeLessThan(n * 0.11);
    }
  });

  test('normal() has mean ≈ 0, sd ≈ 1 and no call-history dependence', () => {
    const n = 20_000;
    let sum = 0;
    let sumSq = 0;
    const r = createRng(11).forHour(5);
    for (let i = 0; i < n; i++) {
      const z = r.normal();
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);

    // Two draws per normal(), never a cached value: the k-th normal() equals
    // the value computed from the (2k−1)-th and 2k-th uniforms.
    const a = createRng(11).forHour(5);
    const b = createRng(11).forHour(5);
    const u1 = 1 - b.next();
    const u2 = b.next();
    expect(a.normal()).toBe(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  });

  test('lognormal(σ) has mean ≈ 1', () => {
    for (const sigma of [0.08, 0.5]) {
      const n = 40_000;
      let sum = 0;
      for (let h = 0; h < 40; h++) {
        const r = createRng(5).forHour(h);
        for (let i = 0; i < n / 40; i++) sum += r.lognormal(sigma);
      }
      expect(sum / n).toBeCloseTo(1, sigma < 0.1 ? 2 : 1);
    }
    expect(createRng(5).forHour(0).lognormal(0)).toBe(1);
  });

  test('int, pick and shuffle', () => {
    const r = createRng(9).forHour(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    const items = ['a', 'b', 'c', 'd', 'e'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(r.pick(items));

    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const frozen = Object.freeze(input.slice());
    const out = createRng(9).forHour(2).shuffle(frozen);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(frozen).toEqual(input); // input not mutated
    expect(createRng(9).forHour(2).shuffle(input)).toEqual(out); // deterministic
    expect(createRng(9).forHour(3).shuffle(input)).not.toEqual(out); // and seed-sensitive
  });
});
