<!--
  Overview — notice (plan §4.4, §7 T7).

  Runway and slope, the cash curve with a dashed projection at the current
  slope, four headline signals, open incidents. No lever lives here: nothing
  in this file dispatches. Every number is a selector over the ledger; the
  projection is a straight line at the trailing-week slope, labelled as one.
-->
<script lang="ts">
  import { game } from '../stores/game.svelte';
  import { href } from '../router';
  import { clockLabel, money, moneyPerDay, moneyPerWeek, months, pct, tokens } from '../format';
  import { simClock, sinceLogin } from '../../sim/time';
  import type { HeadlineSignal, Incident } from '../../sim/metrics';
  import Stat from '../components/Stat.svelte';
  import Panel from '../components/Panel.svelte';
  import TimeSeries from '../components/TimeSeries.svelte';
  import StatusPill from '../components/StatusPill.svelte';

  const HOURS_PER_DAY = 24;
  const HOURS_PER_WEEK = 168;
  /** Days of history drawn and days projected forward. */
  const CURVE_DAYS = 28;
  /** The error-rate line above which the tile says so in words. */
  const ERROR_BUDGET = 0.05;

  const spendByModel = href({ room: 'spend', query: { group: 'model' } });
  const spendByFleet = href({ room: 'spend', query: { group: 'fleet' } });

  // --- tiles ------------------------------------------------------------------
  const runwayText = $derived(months(game.runway));
  const slopeText = $derived(moneyPerWeek(game.slope));
  const cashText = $derived(`cash ${money(game.state.cash)}`);

  // --- cash curve ---------------------------------------------------------------
  // One point per completed sim-day; a day `d` closes at t = (d + 1) × 24.
  const curve = $derived.by(() => {
    const days = game.state.daily.slice(-CURVE_DAYS);
    const bucketT = days.map((d) => (d.day + 1) * HOURS_PER_DAY);
    const values = days.map((d) => d.cashClose);
    return { bucketT, values };
  });

  // 28 daily points forward from the last close along the trailing-week slope.
  const projection = $derived.by(() => {
    const n = curve.values.length;
    if (n === 0) return undefined;
    const lastT = curve.bucketT[n - 1];
    const lastClose = curve.values[n - 1];
    const perDay = game.slope / (HOURS_PER_WEEK / HOURS_PER_DAY);
    const bucketT: number[] = [lastT];
    const values: number[] = [lastClose];
    for (let k = 1; k <= CURVE_DAYS; k++) {
      bucketT.push(lastT + k * HOURS_PER_DAY);
      values.push(lastClose + k * perDay);
    }
    return { bucketT, values };
  });

  const zeroLine = $derived.by(() => {
    const pz = game.projectedZero();
    if (pz === null) return 'climbing';
    const wk = simClock(sinceLogin(pz.atT)).week;
    return `cash reaches zero ≈ wk ${wk} (${pz.weeksFromNow.toFixed(1)} wk from now)`;
  });

  /** Axis label: `wk 3 · d 2` (the hour is noise at a day per bucket). */
  function dayLabel(t: number): string {
    const c = simClock(sinceLogin(t));
    const wk = c.week < 0 ? `−${-c.week}` : String(c.week);
    return `wk ${wk} · d ${c.day}`;
  }

  // --- headline signals -----------------------------------------------------------
  interface Tile {
    id: HeadlineSignal['id'];
    label: string;
    value: string;
    sub?: string;
    history: number[];
    tone: 'money' | 'neutral' | 'bad';
    status?: 'bad';
    goodWhen: 'up' | 'down';
    href?: string;
  }

  function tileOf(s: HeadlineSignal): Tile {
    const base = { id: s.id, label: s.label, history: s.history, goodWhen: s.goodWhen };
    switch (s.id) {
      case 'runway':
        return { ...base, value: months(s.value), tone: 'money', sub: 'at the trailing-week slope' };
      case 'net':
        return { ...base, value: moneyPerWeek(s.value ?? 0), tone: 'money', sub: 'trailing 7 sim-days' };
      case 'tokens':
        return { ...base, value: tokens(s.value ?? 0), tone: 'neutral', sub: 'trailing 24 h', href: spendByModel };
      case 'errors': {
        const rate = s.value ?? 0;
        // The state is glyph + words (the pill and the sub-line), never the hue alone.
        return rate > ERROR_BUDGET
          ? { ...base, value: pct(rate), tone: 'bad', status: 'bad', sub: `above ${pct(ERROR_BUDGET, 0)} budget` }
          : { ...base, value: pct(rate), tone: 'neutral', sub: 'within budget' };
      }
    }
  }

  const tiles = $derived(game.headline.map(tileOf));

  // --- incidents ------------------------------------------------------------------
  const incidents = $derived(game.incidents);

  function pillOf(i: Incident): 'storm' | 'breached' {
    return i.kind === 'retry-storm' ? 'storm' : 'breached';
  }
</script>

<div class="room">
  <div class="big">
    <Stat label="runway" value={runwayText} sub={cashText} tone="money" />
    <Stat label="net / week" value={slopeText} sub="trailing 7 sim-days" tone="money" />
  </div>

  <Panel title="cash" subtitle="28 sim-days of closes; the dashed line is the trailing-week slope carried 28 days forward">
    <TimeSeries
      bucketT={curve.bucketT}
      series={[{ key: 'cash', label: 'cash', values: curve.values }]}
      money
      zeroLine
      {projection}
      height={220}
      formatY={(v) => money(v)}
      formatX={dayLabel}
    />
    <p class="zero mono" aria-live="polite">{zeroLine}</p>
  </Panel>

  <div class="tiles">
    {#each tiles as tile (tile.id)}
      <Stat
        label={tile.label}
        value={tile.value}
        sub={tile.sub}
        history={tile.history}
        tone={tile.tone}
        status={tile.status}
        goodWhen={tile.goodWhen}
        href={tile.href}
      />
    {/each}
  </div>

  <Panel title="open incidents" subtitle={incidents.length === 0 ? undefined : `${incidents.length} open`}>
    {#if incidents.length === 0}
      <p class="dim">no open incidents</p>
    {:else}
      <ul class="incidents">
        {#each incidents as i (i.id)}
          <li class="incident">
            <StatusPill status={pillOf(i)} label={i.kind} />
            <a class="fleet mono" href={href({ room: 'fleet', id: i.fleetId })}>{i.fleetId}</a>
            <span class="summary">{i.summary}</span>
            <span class="cost money">{moneyPerDay(i.costPerDay)}</span>
            <span class="since mono dim">since {clockLabel(i.since)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>

  <Panel title="where the money goes">
    <a class="door" href={spendByFleet}>
      <span>Spend Explorer, by fleet</span>
      <span class="arrow mono" aria-hidden="true">→</span>
    </a>
  </Panel>
</div>

<style>
  .room {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .big {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--gap);
  }
  .big :global(.value) {
    font-size: 2.4em;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--gap);
  }
  .zero {
    margin-top: 0.4em;
    font-size: 0.9em;
    color: var(--fg-muted);
  }
  .incidents {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4em;
  }
  .incident {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: 0.8em;
    padding: 0.3em 0.2em;
    border-bottom: 1px solid var(--line);
  }
  .incident:last-child {
    border-bottom: none;
  }
  .summary {
    font-family: var(--font-ui);
    min-width: 0;
  }
  .since,
  .cost {
    white-space: nowrap;
    font-size: 0.9em;
  }
  .door {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4em 0.2em;
    color: var(--fg);
  }
  .door:hover {
    text-decoration: none;
    color: var(--accent);
  }
  @media (max-width: 720px) {
    .incident {
      grid-template-columns: auto 1fr;
    }
  }
</style>
