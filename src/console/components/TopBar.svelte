<!--
  TopBar — runway · slope · clock · time controls · the bought-weeks badge
  (plan §4.5, §4.4 "the payoff beat", T9).

  Reads `game`; writes only through `game.pause/resume/setSpeed/advance*`
  and `game.newRun`. The badge appears only from `game.payoff`, which the
  RunController sets after an action has had ≥ PAYOFF_MIN_HOURS to show
  itself, so at any speed the bar stays quiet while nothing is pending.
  Five badge states, each a glyph plus words, shown for six seconds:
    delta ≥ 0.1      accent   ▲ +3.1 wk bought
    |delta| < 0.1    muted    no change
    delta ≤ −0.1     muted    ▼ −0.5 wk
    climbing         accent   ▲ climbing
    nowFinite        muted    runway now finite · 26 wk
  The baseline is the runway at the moment of the action, so the number
  attributes to the player only what changed since they acted.
-->
<script lang="ts">
  import { game } from '../stores/game.svelte';
  import { money, moneyPerWeek, months, num, signed, weeks } from '../format';
  import { SIM_SPEEDS, simClock, sinceLogin, type SimSpeed } from '../../sim/time';
  import type { Payoff } from '../core/run';

  const HOURS_PER_DAY = 24;
  /** How long the badge stays before it fades. */
  const BADGE_MS = 6000;
  /** Below this many weeks either way the badge says "no change". */
  const NO_CHANGE_WEEKS = 0.1;

  /** Speeds labelled by what they mean, never by a multiplier alone. */
  const SPEED_LABEL: Record<SimSpeed, string> = {
    1: '1 wk / day',
    24: '1 wk / hour',
    168: '1 wk / 8.6 min',
    1008: '1 wk / 86 s',
  };

  // --- readings ---------------------------------------------------------------
  const runwayText = $derived(months(game.runway));
  const slope = $derived(game.slope);
  const slopeGlyph = $derived(slope >= 0 ? '▲' : '▼');
  const slopeText = $derived(moneyPerWeek(slope));
  const clockText = $derived(game.clock);
  const cashText = $derived(money(game.state.cash));

  // --- the badge --------------------------------------------------------------
  interface Badge {
    tone: 'accent' | 'muted';
    glyph: string;
    text: string;
  }

  function badgeOf(p: Payoff): Badge {
    const b = p.bought;
    switch (b.kind) {
      case 'climbing':
        return { tone: 'accent', glyph: '▲', text: 'climbing' };
      case 'nowFinite':
        return { tone: 'muted', glyph: '', text: `runway now finite · ${weeks(b.runwayWeeks)}` };
      case 'delta':
        if (b.weeks >= NO_CHANGE_WEEKS) return { tone: 'accent', glyph: '▲', text: `${signed(b.weeks, weeks)} bought` };
        if (b.weeks <= -NO_CHANGE_WEEKS) return { tone: 'muted', glyph: '▼', text: weeks(b.weeks) };
        return { tone: 'muted', glyph: '', text: 'no change' };
    }
  }

  let badge: Badge | null = $state(null);
  let badgeTimer: ReturnType<typeof setTimeout> | null = null;

  // A new payoff object means a new answer; show it, then let it go.
  $effect(() => {
    const p = game.payoff;
    if (!p) return;
    badge = badgeOf(p);
    if (badgeTimer !== null) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      badge = null;
      badgeTimer = null;
    }, BADGE_MS);
    return () => {
      if (badgeTimer !== null) clearTimeout(badgeTimer);
      badgeTimer = null;
    };
  });

  // --- the away line (shown once per load) --------------------------------------
  let awayDismissed = $state(false);
  const away = $derived.by(() => {
    const a = game.awaySummary;
    if (!a || awayDismissed || a.hours <= 0) return null;
    const days = a.hours / HOURS_PER_DAY;
    const dayText = days >= 1 ? `${num(days, days < 10 ? 1 : 0)} sim-days` : `${a.hours} sim-hours`;
    return `while you were away: ${dayText}, ${money(a.cashDelta)}`;
  });

  // --- bankruptcy -----------------------------------------------------------------
  const bankruptWeek = $derived.by(() => {
    const at = game.state.bankruptAt;
    return at === null ? null : simClock(sinceLogin(at)).week;
  });

  // --- controls -------------------------------------------------------------------
  function togglePause(): void {
    if (game.paused) game.resume();
    else game.pause();
  }

  function onSpeed(event: Event): void {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    const speed = SIM_SPEEDS.find((s) => s === value);
    if (speed !== undefined) game.setSpeed(speed);
  }

  function newRun(): void {
    // TODO(prestige): the post-mortem and carried artifacts land here.
    game.newRun();
  }
</script>

<header class="topbar" aria-label="run status and time controls">
  <div class="reading" aria-label="runway">
    <span class="k">runway</span>
    <span class="v money">{runwayText}</span>
    <span class="sub dim mono">cash {cashText}</span>
  </div>

  <div class="reading" aria-label="net per week">
    <span class="k">net / wk</span>
    <span class="v mono">
      <span class="glyph" aria-hidden="true">{slopeGlyph}</span>
      {slopeText}
    </span>
    <span class="sub dim">trailing 7 sim-days</span>
  </div>

  <div class="reading" aria-label="sim clock">
    <span class="k">clock</span>
    <span class="v mono">{clockText}</span>
    <span class="sub dim">{game.paused ? 'paused' : SPEED_LABEL[game.speed]}</span>
  </div>

  <div class="controls" role="group" aria-label="time controls">
    {#if game.isBankrupt}
      <span class="pill bankrupt" role="status">
        <span class="glyph" aria-hidden="true">✕</span>
        <span>bankrupt · wk {bankruptWeek ?? '?'}</span>
      </span>
      <button class="btn btn-accent" type="button" onclick={newRun}>new run</button>
    {:else}
      <button
        class="btn"
        type="button"
        onclick={togglePause}
        aria-pressed={game.paused}
        title={game.paused ? 'the wall clock stops advancing the sim' : 'wall time advances the sim at the selected speed'}
      >
        <span class="glyph mono" aria-hidden="true">{game.paused ? '▶' : '⏸'}</span>
        <span>{game.paused ? 'resume' : 'pause'}</span>
      </button>
      <label class="speed">
        <span class="dim">speed</span>
        <select class="input" value={String(game.speed)} onchange={onSpeed} aria-label="sim speed">
          {#each SIM_SPEEDS as s (s)}
            <option value={String(s)}>{SPEED_LABEL[s]}</option>
          {/each}
        </select>
      </label>
      <button class="btn" type="button" onclick={() => game.advanceDays(1)} title="advance the sim by one day">+1 day</button>
      <button class="btn" type="button" onclick={() => game.advanceWeeks(1)} title="advance the sim by one week">+1 week</button>
    {/if}
  </div>

  <div class="signals">
    {#if badge}
      <span class="badge tone-{badge.tone}" role="status">
        {#if badge.glyph}<span class="glyph" aria-hidden="true">{badge.glyph}</span>{/if}
        <span class="mono">{badge.text}</span>
      </span>
    {/if}
    {#if away}
      <span class="away dim" role="status">
        <span class="mono">{away}</span>
        <button class="dismiss" type="button" onclick={() => (awayDismissed = true)} aria-label="dismiss">×</button>
      </span>
    {/if}
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: calc(var(--gap) * 1.5);
    padding: var(--gap) calc(var(--gap) * 1.5);
    background: var(--bg-1);
    border-bottom: 1px solid var(--line);
    font-family: var(--font-ui);
  }
  .reading {
    display: grid;
    grid-template-columns: auto;
    line-height: 1.2;
    min-width: 8rem;
  }
  .k {
    font-size: 0.75em;
    color: var(--fg-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .v {
    font-size: 1.25em;
    font-weight: 600;
    white-space: nowrap;
  }
  .sub {
    font-size: 0.75em;
  }
  .glyph {
    font-family: var(--font-data);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5em;
    flex-wrap: wrap;
  }
  .speed {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.9em;
  }
  .signals {
    display: flex;
    align-items: center;
    gap: var(--gap);
    margin-left: auto;
    flex-wrap: wrap;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.2em 0.7em;
    border: 1px solid var(--line);
    border-radius: 999px;
    animation: badge-life 6s linear forwards;
  }
  .tone-accent {
    color: var(--fg);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .tone-accent .glyph { color: var(--accent); }
  .tone-muted {
    color: var(--fg-muted);
    background: var(--bg-2);
  }
  @keyframes badge-life {
    0% { opacity: 0; transform: translateY(-4px); }
    6% { opacity: 1; transform: none; }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }
  .away {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.85em;
  }
  .dismiss {
    border: 0;
    background: transparent;
    color: var(--fg-muted);
    font: inherit;
    cursor: pointer;
    padding: 0 0.3em;
  }
  .dismiss:hover { color: var(--fg); }
  .bankrupt {
    border-color: var(--bad);
    color: var(--fg);
  }
  .bankrupt .glyph { color: var(--bad); }
</style>
