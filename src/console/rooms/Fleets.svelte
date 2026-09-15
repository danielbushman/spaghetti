<!--
  Fleets — the fleet table and the pause / scale-to-zero levers (plan §4.4, §7 T7).

  Every column is a selector over the trailing day; the status pill is derived
  here from the row (paused → storm → idle → active) and always reads as a
  glyph plus a word. The pause button's `title` prices the pause from the
  customers the fleet serves — a fact, not a warning. Sort state survives a
  reload in localStorage (best effort, never required).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { game } from '../stores/game.svelte';
  import { router } from '../router.svelte';
  import { href } from '../router';
  import { money, moneyPerDay, num, pct, slots as fmtSlots, tokens } from '../format';
  import type { Tier } from '../../sim/types';
  import type { FleetSummary } from '../../sim/metrics';
  import { TIER_ORDER } from '../../sim/metrics';
  import DataTable from '../components/DataTable.svelte';
  import StatusPill from '../components/StatusPill.svelte';
  import TierBadge from '../components/TierBadge.svelte';
  import Sparkline from '../../client/components/Sparkline.svelte';

  type Dir = 'asc' | 'desc';
  type Status = 'paused' | 'storm' | 'idle' | 'active';

  const SORT_KEY = 'spaghetti.console.fleets.sort';
  /** Attempts per job above which a fleet is in a retry storm (the incident's own threshold). */
  const STORM_ATTEMPTS = 1.5;
  /** Utilisation below which a provisioned fleet with an empty queue is idle. */
  const IDLE_UTILIZATION = 0.05;

  const constants = game.run.config.constants;

  // --- status -------------------------------------------------------------------
  /** paused → storm → idle → active, in that order of precedence. */
  function statusOf(f: FleetSummary): Status {
    if (f.status === 'paused') return 'paused';
    if (f.attemptsPerJob > STORM_ATTEMPTS) return 'storm';
    if (f.utilization < IDLE_UTILIZATION && f.slots > constants.SCALE_TO_ZERO_MIN_SLOTS && f.queueDepth === 0) return 'idle';
    return 'active';
  }

  interface Row extends FleetSummary {
    kind: Status;
    scaleToZero: boolean;
    /** The tier mix as an ordered list of the tiers that carry tokens. */
    mix: { tier: Tier; share: number }[];
    /** The dominant tier and its share, for sorting the mix column. */
    topTier: string;
  }

  /** Mirrors DataTable's column shape for `Row`. */
  interface Column {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    format?: (row: Row) => string;
    value?: (row: Row) => number | string | null | undefined;
    cell?: Snippet<[Row]>;
    title?: string;
  }

  const rows = $derived.by((): Row[] =>
    game.fleets.map((f) => {
      const mix = TIER_ORDER.map((tier) => ({ tier, share: f.tierMix[tier] })).filter((m) => m.share > 0);
      const top = mix.length > 0 ? mix.reduce((a, b) => (b.share > a.share ? b : a)) : null;
      return {
        ...f,
        kind: statusOf(f),
        scaleToZero: game.state.fleets[f.id]?.policy.scaleToZero ?? false,
        mix,
        topTier: top ? `${top.tier} ${top.share.toFixed(3)}` : '',
      };
    }),
  );

  // --- header line ----------------------------------------------------------------
  const totalCostPerDay = $derived(rows.reduce((s, r) => s + r.costPerDay, 0));
  const counts = $derived.by(() => {
    const c: Record<Status, number> = { active: 0, storm: 0, idle: 0, paused: 0 };
    for (const r of rows) c[r.kind] += 1;
    return c;
  });

  // --- sort state ---------------------------------------------------------------------
  function loadSort(): { key: string; dir: Dir } {
    try {
      const raw = localStorage.getItem(SORT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown };
        if (typeof parsed.key === 'string' && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
          return { key: parsed.key, dir: parsed.dir };
        }
      }
    } catch {
      // storage unavailable or corrupt: fall through to the default
    }
    return { key: 'costPerDay', dir: 'desc' };
  }

  let sortKey = $state(loadSort().key);
  let sortDir = $state<Dir>(loadSort().dir);

  function onSort(key: string, dir: Dir): void {
    sortKey = key;
    sortDir = dir;
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify({ key, dir }));
    } catch {
      // best effort
    }
  }

  // --- levers ----------------------------------------------------------------------------
  function togglePause(r: Row): void {
    game.dispatch({ type: 'fleet.policy', fleetId: r.id, patch: { status: r.status === 'paused' ? 'active' : 'paused' } });
  }

  function toggleScaleToZero(r: Row): void {
    game.dispatch({ type: 'fleet.policy', fleetId: r.id, patch: { scaleToZero: !r.scaleToZero } });
  }

  /** The price of a pause, from the customers the fleet serves. */
  function pauseTitle(r: Row): string {
    const arr = r.serves.reduce((s, c) => s + c.arrPerMonth, 0);
    const names = r.serves.map((c) => c.name).join(', ');
    const n = r.serves.length;
    return (
      `pause: arrivals queue, nothing is processed, no tokens, no reserved slots. ` +
      `pausing breaches ${n} customer${n === 1 ? '' : 's'} after ${constants.SLA_BACKLOG_HOURS} h (${names}): ${money(arr)}/mo revenue`
    );
  }

  const scaleTitle = `scale to zero: reserved slots follow demand (${constants.SCALE_TO_ZERO_MIN_SLOTS} warm slots minimum) instead of staying at the provisioned count`;

  function openFleet(r: Row): void {
    router.navigate({ room: 'fleet', id: r.id });
  }

  const columns: Column[] = [
    { key: 'name', label: 'fleet', sortable: true, title: 'the fleet id' },
    { key: 'role', label: 'role', sortable: true },
    { key: 'kind', label: 'status', sortable: true, cell: statusCell, title: 'paused · storm (retries > 1.5 per job) · idle (utilisation < 5 %, empty queue, more than the warm minimum of slots) · active' },
    { key: 'topTier', label: 'tier mix', sortable: true, cell: mixCell, title: 'share of the trailing day’s tokens per model tier' },
    { key: 'costPerDay', label: 'cost / day', sortable: true, align: 'right', cell: costCell, title: 'tokens plus reserved slots over the trailing 24 h' },
    { key: 'tokensPerDay', label: 'tokens / day', sortable: true, align: 'right', format: (r: Row) => tokens(r.tokensPerDay) },
    { key: 'errorRate', label: 'error %', sortable: true, align: 'right', format: (r: Row) => pct(r.errorRate), title: 'attempt-weighted error rate over the trailing 24 h' },
    { key: 'attemptsPerJob', label: 'attempts / job', sortable: true, align: 'right', format: (r: Row) => num(r.attemptsPerJob, 2), title: 'attempts divided by jobs processed; 1.00 means no retries' },
    { key: 'utilization', label: 'util', sortable: true, align: 'right', format: (r: Row) => pct(r.utilization, 0), title: 'slots needed over slots provisioned, capped at 100 %' },
    { key: 'queueDepth', label: 'queue', sortable: true, align: 'right', format: (r: Row) => num(r.queueDepth), title: 'jobs waiting at the end of the hour' },
    { key: 'slots', label: 'slots', sortable: true, align: 'right', format: (r: Row) => fmtSlots(r.slots), title: 'reserved slots this hour' },
    // Sortable by its 7-day total so the sparkline column is a real data column (§4.4).
    { key: 'costHistory7d', label: 'cost · 7d', sortable: true, cell: sparkCell, value: (r: Row) => r.costHistory7d.reduce((s, v) => s + v, 0), title: 'sum of the last 7 sim-days’ cost' },
    { key: 'controls', label: 'levers', sortable: false, cell: controlsCell, value: () => null },
  ];
</script>

{#snippet statusCell(r: Row)}
  <StatusPill status={r.kind} />
{/snippet}

{#snippet mixCell(r: Row)}
  <span class="mix">
    {#each r.mix as m (m.tier)}
      <TierBadge tier={m.tier} share={m.share} />
    {/each}
    {#if r.mix.length === 0}
      <span class="dim">–</span>
    {/if}
  </span>
{/snippet}

{#snippet costCell(r: Row)}
  <span class="money">{money(r.costPerDay)}</span>
{/snippet}

{#snippet sparkCell(r: Row)}
  <span class="spark" aria-label="7-day cost history">
    <Sparkline values={r.costHistory7d} width={72} height={16} />
  </span>
{/snippet}

{#snippet controlsCell(r: Row)}
  <span class="controls">
    <button type="button" class="btn" onclick={() => togglePause(r)} title={pauseTitle(r)}>
      <span class="mono" aria-hidden="true">{r.status === 'paused' ? '▶' : '‖'}</span>
      <span>{r.status === 'paused' ? 'resume' : 'pause'}</span>
    </button>
    <button
      type="button"
      class="btn"
      class:on={r.scaleToZero}
      aria-pressed={r.scaleToZero}
      onclick={() => toggleScaleToZero(r)}
      title={scaleTitle}
    >
      <span class="mono" aria-hidden="true">{r.scaleToZero ? '◆' : '◇'}</span>
      <span>scale to zero{r.scaleToZero ? ' · on' : ''}</span>
    </button>
  </span>
{/snippet}

<div class="room">
  <header class="head">
    <h2>fleets</h2>
    <p class="line mono">
      <span class="money">{moneyPerDay(totalCostPerDay)}</span>
      <span class="dim">·</span>
      <span>{rows.length} fleets</span>
      <span class="dim">·</span>
      <span>{counts.active} active</span>
      <span class="dim">·</span>
      <span>{counts.storm} storm</span>
      <span class="dim">·</span>
      <span>{counts.idle} idle</span>
      <span class="dim">·</span>
      <span>{counts.paused} paused</span>
    </p>
  </header>

  <div class="panel table">
    <DataTable
      {columns}
      {rows}
      rowKey={(r) => r.id}
      {sortKey}
      {sortDir}
      {onSort}
      onRowClick={openFleet}
      rowHref={(r) => href({ room: 'fleet', id: r.id })}
    />
  </div>
</div>

<style>
  .room {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--gap);
  }
  h2 {
    font-size: 1.1em;
  }
  .line {
    display: flex;
    gap: 0.5em;
    flex-wrap: wrap;
    font-size: 0.9em;
  }
  .table {
    padding: 0;
    overflow: hidden;
  }
  .mix {
    display: inline-flex;
    gap: 0.8em;
    flex-wrap: wrap;
  }
  .spark {
    display: inline-block;
    color: var(--money);
    line-height: 0;
  }
  .controls {
    display: inline-flex;
    gap: 0.4em;
    white-space: nowrap;
  }
  .controls .btn {
    padding: 0.2em 0.6em;
    font-size: 0.85em;
  }
  .btn.on {
    border-color: var(--accent);
  }
</style>
