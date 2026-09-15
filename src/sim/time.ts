/**
 * Sim time. Plan §3.1 (T1).
 *
 * One tick = one sim-hour. The sim itself never reads a clock; the console
 * passes wall-clock milliseconds in through `hoursDue`, and this module only
 * does arithmetic on them. Nothing under src/sim reads the wall clock.
 */

const HOURS_PER_WEEK = 168;
const HOURS_PER_DAY = 24;
const MS_PER_REAL_DAY = 86_400_000;

/** 28 days of prelude before the player's first login. */
export const PRELUDE_HOURS = 672;

/** 1 real day = 1 sim-week at speed 1. */
export const SIM_HOURS_PER_REAL_MS = HOURS_PER_WEEK / MS_PER_REAL_DAY;

/** Never catch up more than a sim-year in one go. */
export const MAX_CATCHUP_HOURS = 8760;

/** Dev speeds: one sim-week per real day / hour / 8.6 min / 86 s. */
export type SimSpeed = 1 | 24 | 168 | 1008;
export const SIM_SPEEDS: readonly SimSpeed[] = [1, 24, 168, 1008];

/**
 * Whole sim-hours owed for the wall time between `stampMs` and `nowMs` at
 * `speed`, plus any `carryMs` left over from the previous call. Floors to
 * whole hours, returns the remainder as `carryMs` (wall-clock ms), clamps at
 * `MAX_CATCHUP_HOURS` (the excess is dropped, carry reset) and is never
 * negative — a clock that went backwards, or bad input, owes nothing.
 */
export function hoursDue(
  stampMs: number,
  nowMs: number,
  speed: SimSpeed,
  carryMs = 0,
): { hours: number; carryMs: number } {
  const elapsed = nowMs - stampMs;
  const elapsedMs =
    (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0) +
    (Number.isFinite(carryMs) ? Math.max(0, carryMs) : 0);

  // hours = elapsedMs × speed × 168 / 86 400 000. The product is formed first
  // so a whole real day at speed 1 divides to exactly 168, not 167.999….
  const simHoursScaled = elapsedMs * speed * HOURS_PER_WEEK;
  const hours = Math.floor(simHoursScaled / MS_PER_REAL_DAY);
  if (hours >= MAX_CATCHUP_HOURS) return { hours: MAX_CATCHUP_HOURS, carryMs: 0 };

  // Remainder converted back to wall-clock ms at this speed.
  const carry = (simHoursScaled - hours * MS_PER_REAL_DAY) / (speed * HOURS_PER_WEEK);
  return { hours, carryMs: Math.max(0, carry) };
}

/** The player's clock reads from login. */
export function sinceLogin(t: number): number {
  return t - PRELUDE_HOURS;
}

export interface SimClock {
  /** 1-based from login; the week before login is −1 (there is no week 0). */
  week: number;
  /** 1-based day within the week. */
  day: number;
  /** 0–23. */
  hour: number;
  /** `wk 3 · d 2 · 14:00`; negative weeks use U+2212 minus: `wk −2 · d 3 · 14:00`. */
  label: string;
}

/**
 * Sim clock for a number of hours since login. Login is `wk 1 · d 1 · 00:00`;
 * the hour before it is `wk −1 · d 7 · 23:00`, so the prelude reads as weeks
 * −4 … −1 and axis labels never show a week 0.
 */
export function simClock(hoursSinceLogin: number): SimClock {
  const h = Math.floor(hoursSinceLogin);
  const weekIndex = Math.floor(h / HOURS_PER_WEEK); // 0 for the login week, −1 before it
  const week = weekIndex >= 0 ? weekIndex + 1 : weekIndex;
  const inWeek = ((h % HOURS_PER_WEEK) + HOURS_PER_WEEK) % HOURS_PER_WEEK; // positive modulo
  const day = Math.floor(inWeek / HOURS_PER_DAY) + 1;
  const hour = inWeek % HOURS_PER_DAY;
  const weekText = week < 0 ? `−${-week}` : String(week);
  const label = `wk ${weekText} · d ${day} · ${String(hour).padStart(2, '0')}:00`;
  return { week, day, hour, label };
}

/** Hours expressed in sim-weeks (fractional). */
export function weeksOf(hours: number): number {
  return hours / HOURS_PER_WEEK;
}
