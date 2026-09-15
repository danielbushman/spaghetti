/**
 * Sim time contract (plan §3.1, §6 T1).
 *
 *   bun test tests/sim/time.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  MAX_CATCHUP_HOURS,
  PRELUDE_HOURS,
  SIM_HOURS_PER_REAL_MS,
  SIM_SPEEDS,
  hoursDue,
  simClock,
  sinceLogin,
  weeksOf,
} from '../../src/sim/time';

const REAL_DAY_MS = 86_400_000;
const MINUS = '−';

describe('constants', () => {
  test('pin the plan values', () => {
    expect(PRELUDE_HOURS).toBe(672);
    expect(MAX_CATCHUP_HOURS).toBe(8760);
    expect(SIM_HOURS_PER_REAL_MS).toBe(168 / REAL_DAY_MS);
    expect(SIM_SPEEDS).toEqual([1, 24, 168, 1008]);
  });
});

describe('hoursDue', () => {
  test('one real day at 1× is exactly one sim-week', () => {
    expect(hoursDue(0, REAL_DAY_MS, 1, 0)).toEqual({ hours: 168, carryMs: 0 });
    expect(hoursDue(0, REAL_DAY_MS, 1)).toEqual({ hours: 168, carryMs: 0 });
  });

  test('sub-hour wall time is carried, not lost', () => {
    expect(hoursDue(0, 1000, 1, 0)).toEqual({ hours: 0, carryMs: 1000 });

    // Exactly one sim-hour at 1× is 86_400_000 / 168 ms ≈ 514 285.71 ms.
    const msPerSimHour = REAL_DAY_MS / 168;
    const half = hoursDue(0, Math.ceil(msPerSimHour / 2), 1, 0);
    expect(half.hours).toBe(0);
    expect(half.carryMs).toBeCloseTo(Math.ceil(msPerSimHour / 2), 6);

    // Feeding the carry back with the other half completes the hour.
    const rest = hoursDue(0, Math.ceil(msPerSimHour / 2), 1, half.carryMs);
    expect(rest.hours).toBe(1);
    expect(rest.carryMs).toBeGreaterThanOrEqual(0);
    expect(rest.carryMs).toBeLessThan(1); // two ceils overshoot by well under a ms
  });

  test('accumulating many small slices owes the same hours as one big one', () => {
    const slices = 499; // total lands mid-hour, so the carry comparison is meaningful
    const sliceMs = 12_345;
    let carry = 0;
    let hours = 0;
    for (let i = 0; i < slices; i++) {
      const r = hoursDue(i * sliceMs, (i + 1) * sliceMs, 24, carry);
      hours += r.hours;
      carry = r.carryMs;
    }
    const whole = hoursDue(0, slices * sliceMs, 24, 0);
    expect(hours).toBe(whole.hours);
    expect(carry).toBeCloseTo(whole.carryMs, 3);
  });

  test('speeds multiply the sim rate', () => {
    expect(hoursDue(0, REAL_DAY_MS / 24, 24, 0).hours).toBe(168); // one sim-week per real hour
    expect(hoursDue(0, 3_600_000, 1, 0).hours).toBe(7); // 1 real hour at 1× = 7 sim-hours
    expect(hoursDue(0, 86_000, 1008, 0).hours).toBe(168); // 86 s at 1008× ≈ a sim-week
    expect(hoursDue(0, 3_600_000, 168, 0).hours).toBe(1176); // 7 sim-weeks per real hour
  });

  test('never exceeds MAX_CATCHUP_HOURS, never negative', () => {
    // 15 real days at 1× owe 15 × 168 = 2520 hours (under the cap); a decade at 168× is clamped.
    expect(hoursDue(0, 15 * REAL_DAY_MS, 1, 0).hours).toBe(2520);
    const away = hoursDue(0, 3650 * REAL_DAY_MS, 168, 0);
    expect(away).toEqual({ hours: MAX_CATCHUP_HOURS, carryMs: 0 });
    for (const s of SIM_SPEEDS) {
      expect(hoursDue(0, 1e13, s, 0).hours).toBeLessThanOrEqual(MAX_CATCHUP_HOURS);
    }

    // Clock went backwards, or garbage in → nothing owed, nothing negative.
    expect(hoursDue(1000, 0, 1, 0)).toEqual({ hours: 0, carryMs: 0 });
    expect(hoursDue(0, 1000, 1, -500)).toEqual({ hours: 0, carryMs: 1000 });
    expect(hoursDue(Number.NaN, 1000, 1, 0)).toEqual({ hours: 0, carryMs: 0 });
    expect(hoursDue(0, Number.POSITIVE_INFINITY, 1, 0)).toEqual({ hours: 0, carryMs: 0 });
  });

  test('hours are always whole and carry stays under one sim-hour of wall time', () => {
    for (const s of SIM_SPEEDS) {
      const msPerSimHour = REAL_DAY_MS / (168 * s);
      for (const ms of [1, 999, 51_234, 1_234_567, 9_876_543]) {
        const r = hoursDue(0, ms, s, 0);
        expect(Number.isInteger(r.hours)).toBe(true);
        expect(r.carryMs).toBeGreaterThanOrEqual(0);
        expect(r.carryMs).toBeLessThan(msPerSimHour);
      }
    }
  });
});

describe('sinceLogin / weeksOf', () => {
  test('login is hour 0 of the player clock', () => {
    expect(sinceLogin(PRELUDE_HOURS)).toBe(0);
    expect(sinceLogin(0)).toBe(-PRELUDE_HOURS);
    expect(sinceLogin(PRELUDE_HOURS + 168)).toBe(168);
  });

  test('weeksOf divides by 168', () => {
    expect(weeksOf(168)).toBe(1);
    expect(weeksOf(84)).toBe(0.5);
    expect(weeksOf(0)).toBe(0);
    expect(weeksOf(-336)).toBe(-2);
  });
});

describe('simClock', () => {
  test('login reads wk 1 · d 1 · 00:00', () => {
    expect(simClock(0)).toEqual({ week: 1, day: 1, hour: 0, label: 'wk 1 · d 1 · 00:00' });
  });

  test('week, day and hour are 1-based from login', () => {
    // wk 3 · d 2 · 14:00 = 2 full weeks + 1 full day + 14 h
    expect(simClock(2 * 168 + 24 + 14)).toEqual({
      week: 3,
      day: 2,
      hour: 14,
      label: 'wk 3 · d 2 · 14:00',
    });
    expect(simClock(167)).toEqual({ week: 1, day: 7, hour: 23, label: 'wk 1 · d 7 · 23:00' });
    expect(simClock(168)).toEqual({ week: 2, day: 1, hour: 0, label: 'wk 2 · d 1 · 00:00' });
    expect(simClock(9).label).toBe('wk 1 · d 1 · 09:00'); // zero-padded hour
  });

  test('negative weeks label the prelude with a real minus sign', () => {
    // The hour before login is the last hour of week −1; there is no week 0.
    expect(simClock(-1)).toEqual({ week: -1, day: 7, hour: 23, label: `wk ${MINUS}1 · d 7 · 23:00` });
    expect(simClock(-168)).toEqual({ week: -1, day: 1, hour: 0, label: `wk ${MINUS}1 · d 1 · 00:00` });
    // wk −2 · d 3 · 14:00: two weeks back, then 2 days + 14 h into that week.
    expect(simClock(-2 * 168 + 2 * 24 + 14)).toEqual({
      week: -2,
      day: 3,
      hour: 14,
      label: `wk ${MINUS}2 · d 3 · 14:00`,
    });
    // Genesis (t = 0) is the first hour of week −4.
    expect(simClock(sinceLogin(0))).toEqual({ week: -4, day: 1, hour: 0, label: `wk ${MINUS}4 · d 1 · 00:00` });
    expect(simClock(-1).label).not.toContain('-'); // never ASCII hyphen-minus
  });

  test('fractional hours floor to the current hour', () => {
    expect(simClock(14.9).hour).toBe(14);
    expect(simClock(-0.5)).toEqual(simClock(-1));
  });
});
