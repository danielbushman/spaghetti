/**
 * Formatting contract (plan §7 T5, §6).
 *
 *   bun test tests/console/format.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  MINUS,
  NOT_A_NUMBER,
  clockLabel,
  money,
  moneyPerDay,
  moneyPerWeek,
  months,
  num,
  pct,
  signed,
  slots,
  tokens,
  weeks,
} from '../../src/console/format';
import { PRELUDE_HOURS } from '../../src/sim/time';

describe('money', () => {
  test('the exact strings from the plan', () => {
    expect(money(-5_740_000)).toBe('−$5.74M');
    expect(money(150_000_000)).toBe('$150M');
    expect(moneyPerWeek(-5_740_000)).toBe('−$5.74M/wk');
    expect(moneyPerDay(440_000)).toBe('$440k/day');
    expect(moneyPerDay(4_500)).toBe('$4.5k/day');
  });

  test('uses U+2212, never a hyphen', () => {
    expect(money(-1)).toContain(MINUS);
    expect(money(-5_740_000)).not.toContain('-');
    expect(MINUS).toBe('−');
  });

  test('three significant digits, trailing zeros dropped', () => {
    expect(money(53_000)).toBe('$53k');
    expect(money(750_000)).toBe('$750k');
    expect(money(13_400_000)).toBe('$13.4M');
    expect(money(1_000_000)).toBe('$1M');
    expect(money(2.6e12)).toBe('$2.6T');
    expect(money(1_500_000_000)).toBe('$1.5B');
  });

  test('rounding carries into the next unit', () => {
    expect(money(999_700)).toBe('$1M');
    expect(money(999.6)).toBe('$1k');
  });

  test('small amounts and zero', () => {
    expect(money(742.4)).toBe('$742');
    expect(money(0.25)).toBe('$0.25');
    expect(money(0)).toBe('$0');
    expect(money(-0.004)).toBe('$0');
  });

  test('non-compact groups digits', () => {
    expect(money(-5_740_000, { compact: false })).toBe('−$5,740,000');
    expect(money(150_000_000, { compact: false })).toBe('$150,000,000');
    expect(money(999, { compact: false })).toBe('$999');
  });

  test('non-finite reads as a dash', () => {
    expect(money(Number.NaN)).toBe(NOT_A_NUMBER);
    expect(money(Number.POSITIVE_INFINITY)).toBe(NOT_A_NUMBER);
  });
});

describe('tokens', () => {
  test('the exact strings from the plan', () => {
    expect(tokens(2.6e12)).toBe('2.60T');
    expect(tokens(41_500)).toBe('41.5K');
  });

  test('keeps three significant digits, trailing zeros included', () => {
    expect(tokens(870e9)).toBe('870B');
    expect(tokens(1_000_000)).toBe('1.00M');
    expect(tokens(220)).toBe('220');
    expect(tokens(0)).toBe('0');
    expect(tokens(999_950)).toBe('1.00M');
  });
});

describe('pct / num / slots', () => {
  test('pct', () => {
    expect(pct(0.553)).toBe('55.3%');
    expect(pct(0.61)).toBe('61.0%');
    expect(pct(1, 0)).toBe('100%');
    expect(pct(0)).toBe('0.0%');
    expect(pct(-0.05)).toBe('−5.0%');
    expect(pct(Number.NaN)).toBe(NOT_A_NUMBER);
  });

  test('num groups and rounds', () => {
    expect(num(8800)).toBe('8,800');
    expect(num(1234567.4)).toBe('1,234,567');
    expect(num(2.345, 2)).toBe('2.35');
    expect(num(-42)).toBe('−42');
    expect(num(0)).toBe('0');
  });

  test('slots are whole and grouped', () => {
    expect(slots(8800)).toBe('8,800');
    expect(slots(4113.6)).toBe('4,114');
    expect(slots(25)).toBe('25');
  });
});

describe('clockLabel', () => {
  test('wraps simClock(sinceLogin(t))', () => {
    expect(clockLabel(PRELUDE_HOURS)).toBe('wk 1 · d 1 · 00:00');
    expect(clockLabel(PRELUDE_HOURS + 2 * 168 + 24 + 14)).toBe('wk 3 · d 2 · 14:00');
    expect(clockLabel(PRELUDE_HOURS - 1)).toBe('wk −1 · d 7 · 23:00');
  });
});

describe('weeks / months / signed', () => {
  test('weeks', () => {
    expect(weeks(26.1)).toBe('26.1 wk');
    expect(weeks(26.04)).toBe('26.0 wk');
    expect(weeks(null)).toBe('climbing');
    expect(weeks(-0.5)).toBe('−0.5 wk');
  });

  test('months', () => {
    expect(months(6.2)).toBe('6.2 mo');
    expect(months(null)).toBe('climbing');
  });

  test('signed adds + only to positives', () => {
    expect(signed(3.1, weeks)).toBe('+3.1 wk');
    expect(signed(-0.5, weeks)).toBe('−0.5 wk');
    expect(signed(0, weeks)).toBe('0.0 wk');
    expect(signed(1_200_000, money)).toBe('+$1.2M');
    expect(signed(-5_740_000, moneyPerWeek)).toBe('−$5.74M/wk');
  });
});
