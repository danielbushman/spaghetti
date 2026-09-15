/**
 * The game store: a thin rune wrapper over `RunController`. Plan §4.2 (T5).
 *
 * `state` is `$state.raw` and replaced whole on every change, so nothing in
 * a room can mutate it reactively; rooms read the getters inside `$derived`
 * and write only through `dispatch`. The store owns the 1 s wall-clock
 * driver and flushes saves when the tab hides or unloads.
 *
 * The controller boots when this module is first imported (load the saved
 * run, else start one) so `state` is never null; `boot()` stays callable
 * from `App.svelte` and is a no-op once booted.
 */
import type { Action, SimState } from '../../sim/types';
import type { SimSpeed } from '../../sim/time';
import type { ExploreQuery } from '../../sim/explore';
import { RunController, type AdvanceReport, type AwaySummary, type Payoff } from '../core/run';
import { safeStorage } from '../persistence';
import { clockLabel } from '../format';

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;
/** The wall-clock driver's period. */
export const CLOCK_MS = 1000;

class GameStore {
  readonly run: RunController;

  state: SimState = $state.raw(bootController().state);
  lastAdvance = $state<AdvanceReport | null>(null);
  payoff = $state<Payoff | null>(null);
  awaySummary = $state<AwaySummary | null>(null);
  paused = $state(false);
  speed = $state<SimSpeed>(1);
  isBankrupt = $derived(this.state.status === 'bankrupt');

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.run = bootController();
    this.mirror(this.run);
    this.run.onChange((run) => this.mirror(run));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.run.saveNow();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.run.saveNow());
    }
  }

  /** Copy the controller's public fields into rune state (whole-object replacement). */
  private mirror(run: RunController): void {
    this.state = run.state;
    this.lastAdvance = run.lastAdvance;
    this.payoff = run.payoff;
    this.awaySummary = run.awaySummary;
    this.paused = run.time.paused;
    this.speed = run.time.speed;
  }

  /** Idempotent: the controller booted at construction. */
  boot(): void {
    if (!this.run.booted) this.run.boot();
  }

  /** 1 s setInterval → run.tick(). */
  startClock(): void {
    if (this.timer !== null || typeof setInterval !== 'function') return;
    this.timer = setInterval(() => this.run.tick(), CLOCK_MS);
  }

  stopClock(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  dispatch(action: Action): void {
    this.run.dispatch(action);
  }

  advanceDays(n: number): void {
    this.run.advance(Math.max(0, Math.round(n)) * HOURS_PER_DAY);
  }

  advanceWeeks(n: number): void {
    this.run.advance(Math.max(0, Math.round(n)) * HOURS_PER_WEEK);
  }

  pause(): void {
    this.run.pause();
  }

  resume(): void {
    this.run.resume();
  }

  setSpeed(s: SimSpeed): void {
    this.run.setSpeed(s);
  }

  newRun(seed?: number): void {
    this.run.newRun(seed);
  }

  // Derived views: each reads `this.state` so a `$derived` in a room tracks
  // it; the controller memoises on state identity, so re-reads are free.

  get runway(): number | null {
    void this.state;
    return this.run.runwayMonths();
  }

  get runwayWeeks(): number | null {
    void this.state;
    return this.run.runwayWeeks();
  }

  get slope(): number {
    void this.state;
    return this.run.slope();
  }

  get headline() {
    void this.state;
    return this.run.headline();
  }

  get incidents() {
    void this.state;
    return this.run.incidents();
  }

  get fleets() {
    void this.state;
    return this.run.fleets();
  }

  get routing() {
    void this.state;
    return this.run.routing();
  }

  /** `wk 3 · d 2 · 14:00` for the current hour. */
  get clock(): string {
    return clockLabel(this.state.t);
  }

  fleet(id: string) {
    void this.state;
    return this.run.fleet(id);
  }

  explore(q: ExploreQuery) {
    void this.state;
    return this.run.explore(q);
  }

  projectedZero() {
    void this.state;
    return this.run.projectedZero();
  }
}

let controller: RunController | null = null;

/** One controller per page, booted against the real localStorage on first use. */
function bootController(): RunController {
  if (controller === null) {
    controller = new RunController({ storage: safeStorage() });
    controller.boot();
  }
  return controller;
}

export const game = new GameStore();
