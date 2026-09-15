/**
 * Determinism is structural (plan §2, §6 T3).
 *
 *   bun test tests/sim/determinism.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { createRng } from '../../src/sim/rng';
import { DEFAULT_CONFIG } from '../../src/sim/constants';
import { createState } from '../../src/sim/events';
import { step } from '../../src/sim/step';
import { PRELUDE_HOURS } from '../../src/sim/time';

/** Bun's default per-test timeout is 5 s; a prelude alone is ~700 ticks. */
const SLOW = 60_000;

const WEEK = DEFAULT_CONFIG.constants.HOURS_PER_WEEK;

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x as object)) deepFreeze((x as Record<string, unknown>)[k]);
  }
  return x;
}

describe('determinism', () => {
  test('same seed, 4 weeks → deep-equal states', () => {
    const a = step(createState(7), 4 * WEEK, DEFAULT_CONFIG, createRng(7));
    const b = step(createState(7), 4 * WEEK, DEFAULT_CONFIG, createRng(7));
    expect(a).toEqual(b);
    expect(a.t).toBe(PRELUDE_HOURS + 4 * WEEK);
  }, SLOW);

  test('different seeds → different worlds and ledgers', () => {
    const a = createState(1);
    const b = createState(2);
    expect(a.world.bleeds.idle).not.toEqual(b.world.bleeds.idle);
    expect(a.hourly[0].tokenCost).not.toBe(b.hourly[0].tokenCost);
  }, SLOW);

  test('step(s, 168) ≡ 168 × step(s, 1)', () => {
    const login = createState(3);
    const rng = createRng(3);
    const whole = step(login, WEEK, DEFAULT_CONFIG, rng);
    let hourly = login;
    for (let i = 0; i < WEEK; i++) hourly = step(hourly, 1, DEFAULT_CONFIG, createRng(3));
    expect(hourly).toEqual(whole);
  }, SLOW);

  test('chunking any way gives the same state', () => {
    const login = createState(4);
    const a = step(step(step(login, 5, DEFAULT_CONFIG, createRng(4)), 100, DEFAULT_CONFIG, createRng(4)), 63, DEFAULT_CONFIG, createRng(4));
    const b = step(login, WEEK, DEFAULT_CONFIG, createRng(4));
    expect(a).toEqual(b);
  }, SLOW);

  test('the input is never mutated (deep-frozen)', () => {
    const login = deepFreeze(createState(5));
    const before = JSON.stringify(login);
    const next = step(login, 48, DEFAULT_CONFIG, createRng(5));
    expect(next).not.toBe(login);
    expect(next.t).toBe(login.t + 48);
    expect(JSON.stringify(login)).toBe(before);
  }, SLOW);

  test('step rejects a fractional or negative dtHours and is a no-op for 0', () => {
    const login = createState(6);
    expect(() => step(login, 1.5, DEFAULT_CONFIG, createRng(6))).toThrow(RangeError);
    expect(() => step(login, -1, DEFAULT_CONFIG, createRng(6))).toThrow(RangeError);
    expect(step(login, 0, DEFAULT_CONFIG, createRng(6))).toBe(login);
  }, SLOW);
});
