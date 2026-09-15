/**
 * Number formatting for the console. Plan §7 T5. Pure; no DOM.
 *
 * Every negative number is rendered with U+2212 MINUS SIGN (`−`), never a
 * hyphen, so a slope of `−$5.74M/wk` reads as a minus and not as a dash.
 * Money and tokens are compact to three significant digits; money drops
 * trailing zeros (`$150M`, `$4.5k`) while tokens keep them (`2.60T`), which
 * is the convention the design doc uses for each.
 */
import { simClock, sinceLogin } from '../sim/time';

/** U+2212, the real minus. */
export const MINUS = '−';

/** Placeholder for a value that is not a number. */
export const NOT_A_NUMBER = '—';

interface Scaled {
  /** |n| divided by the unit. */
  value: number;
  suffix: string;
}

const MONEY_UNITS: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

const TOKEN_UNITS: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Decimals that give three significant digits for a value in [0, 1000). */
function sigDecimals(v: number): number {
  if (v >= 100) return 0;
  if (v >= 10) return 1;
  return 2;
}

/** Round `v` to three significant digits as a string; `keepZeros` keeps `2.60`. */
function threeSig(v: number, keepZeros: boolean): string {
  const s = v.toFixed(sigDecimals(v));
  return keepZeros ? s : stripZeros(s);
}

function stripZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Pick the unit for |n|. Rounding may carry a value up to `1000` (999.7k →
 * 1000k), in which case the next unit up is taken so `$1M`, not `$1000k`.
 */
function scale(abs: number, units: readonly [number, string][]): Scaled {
  for (let i = 0; i < units.length; i++) {
    const [unit, suffix] = units[i];
    if (abs < unit) continue;
    const v = abs / unit;
    const rounded = Number(v.toFixed(sigDecimals(v)));
    if (rounded >= 1000 && i > 0) return { value: rounded / 1000, suffix: units[i - 1][1] };
    return { value: v, suffix };
  }
  // Below the smallest unit; a value that rounds to 1000 becomes 1.00 of it.
  const [unit, suffix] = units[units.length - 1];
  if (Math.round(abs) >= unit) return { value: Math.round(abs) / unit, suffix };
  return { value: abs, suffix: '' };
}

function sign(n: number): string {
  return n < 0 ? MINUS : '';
}

/** Group an integer's digits: 5740000 → `5,740,000`. */
function group(intText: string): string {
  return intText.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface MoneyOptions {
  compact?: boolean;
}

/**
 * `money(-5_740_000)` → `−$5.74M`; `money(150_000_000)` → `$150M`;
 * `money(4_500)` → `$4.5k`; `money(742.5)` → `$742`; `money(0.25)` → `$0.25`.
 * `compact: false` → `−$5,740,000`.
 */
export function money(n: number, { compact = true }: MoneyOptions = {}): string {
  if (!Number.isFinite(n)) return NOT_A_NUMBER;
  const abs = Math.abs(n);
  if (!compact) return `${sign(n)}$${group(Math.round(abs).toFixed(0))}`;
  const { value, suffix } = scale(abs, MONEY_UNITS);
  // Below $1k: whole dollars, or cents when the amount is under a dollar.
  const text = suffix === '' ? (value >= 1 ? value.toFixed(0) : stripZeros(value.toFixed(2))) : threeSig(value, false);
  const s = sign(n);
  return text === '0' ? '$0' : `${s}$${text}${suffix}`;
}

export function moneyPerWeek(n: number): string {
  return `${money(n)}/wk`;
}

export function moneyPerDay(n: number): string {
  return `${money(n)}/day`;
}

/** `tokens(2.6e12)` → `2.60T`; `tokens(41_500)` → `41.5K`; `tokens(820)` → `820`. */
export function tokens(n: number): string {
  if (!Number.isFinite(n)) return NOT_A_NUMBER;
  const abs = Math.abs(n);
  const { value, suffix } = scale(abs, TOKEN_UNITS);
  const text = suffix === '' ? value.toFixed(0) : threeSig(value, true);
  return `${sign(n)}${text}${suffix}`;
}

/** Fraction → percent: `pct(0.553)` → `55.3%`; `pct(1, 0)` → `100%`. */
export function pct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return NOT_A_NUMBER;
  const text = (Math.abs(x) * 100).toFixed(digits);
  return `${sign(x)}${text}%`;
}

/** Grouped number with `digits` decimals: `num(8800)` → `8,800`; `num(2.345, 2)` → `2.35`. */
export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return NOT_A_NUMBER;
  const fixed = Math.abs(n).toFixed(digits);
  const dot = fixed.indexOf('.');
  const int = dot < 0 ? fixed : fixed.slice(0, dot);
  const frac = dot < 0 ? '' : fixed.slice(dot);
  return `${sign(n)}${group(int)}${frac}`;
}

/** Whole slots: `slots(8800)` → `8,800`. */
export function slots(n: number): string {
  return num(Math.round(n), 0);
}

/** The sim clock for an absolute sim-hour `t`: `wk 3 · d 2 · 14:00`. */
export function clockLabel(t: number): string {
  return simClock(sinceLogin(t)).label;
}

/** Runway in weeks: `weeks(26.1)` → `26.1 wk`; `weeks(null)` → `climbing`. */
export function weeks(w: number | null): string {
  if (w === null) return 'climbing';
  if (!Number.isFinite(w)) return NOT_A_NUMBER;
  return `${sign(w)}${Math.abs(w).toFixed(1)} wk`;
}

/** Sim-months: `months(6.2)` → `6.2 mo`; null → `climbing`. */
export function months(m: number | null): string {
  if (m === null) return 'climbing';
  if (!Number.isFinite(m)) return NOT_A_NUMBER;
  return `${sign(m)}${Math.abs(m).toFixed(1)} mo`;
}

/**
 * Prefix a positive value with `+`; negatives already carry the minus from
 * `fmt`, zero carries nothing: `signed(3.1, weeks)` → `+3.1 wk`.
 */
export function signed(n: number, fmt: (n: number) => string): string {
  const text = fmt(n);
  return n > 0 && Number.isFinite(n) ? `+${text}` : text;
}
