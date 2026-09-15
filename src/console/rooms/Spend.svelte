<!--
  Spend Explorer — where the money goes (plan §4.4, §7 T8).

  No lever. Every control writes the hash and the room re-reads it, so any
  view is a link: `#/spend?group=model&range=7d&top=10&fleet=summarizer-east`.
  The fleet filter is the sim's own `fleetId`, passed straight through to
  `explore()` for every group-by, so the chip and the numbers are one selector.
  Rows are doors: a fleet or workload row opens Fleet detail, a model row
  opens Routing with that tier outlined, a customer row opens nothing (the
  Customers room is a later hook).
-->
<script lang="ts">
  import type { ExploreLink, ExploreQuery, ExploreSeries } from '../../sim/explore';
  import { game } from '../stores/game.svelte';
  import { router } from '../router.svelte';
  import { href, spendParams, type RouteInput } from '../router';
  import { clockLabel, money, num, tokens } from '../format';
  import BarList from '../components/BarList.svelte';
  import Panel from '../components/Panel.svelte';
  import TimeSeries from '../components/TimeSeries.svelte';

  type GroupBy = ExploreQuery['groupBy'];
  type Range = ExploreQuery['range'];

  const GROUPS: readonly { value: GroupBy; label: string }[] = [
    { value: 'fleet', label: 'fleet' },
    { value: 'model', label: 'model' },
    { value: 'workload', label: 'workload' },
    { value: 'customer', label: 'customer' },
  ];
  const RANGES: readonly { value: Range; label: string }[] = [
    { value: '24h', label: 'last 24 h' },
    { value: '7d', label: 'last 7 days' },
    { value: '28d', label: 'last 28 days' },
    { value: 'run', label: 'whole run' },
  ];
  const HOURS_PER_DAY = 24;

  const isGroup = (s: string): s is GroupBy => GROUPS.some((g) => g.value === s);
  const isRange = (s: string): s is Range => RANGES.some((r) => r.value === s);

  // --- params from the hash (defaults fleet / 7d / 10 / none) -------------------
  const params = $derived(spendParams(router.current.query));
  const groupBy = $derived<GroupBy>(isGroup(params.group) ? params.group : 'fleet');
  const range = $derived<Range>(isRange(params.range) ? params.range : '7d');
  const top = $derived(params.top);
  const fleet = $derived(params.fleet);
  const fleetOrder = $derived(game.state.world.fleetOrder);

  /** The hash for this room with one key changed; an empty fleet drops the key. */
  function routeWith(patch: Partial<{ group: string; range: string; top: string; fleet: string }>): RouteInput {
    const next = { group: groupBy, range, top: String(top), fleet, ...patch };
    const query: Record<string, string> = { group: next.group, range: next.range, top: next.top };
    if (next.fleet) query.fleet = next.fleet;
    return { room: 'spend', query };
  }
  const go = (patch: Partial<{ group: string; range: string; top: string; fleet: string }>): void => router.navigate(routeWith(patch));

  function onTopInput(ev: Event): void {
    const n = Number.parseInt((ev.currentTarget as HTMLInputElement).value, 10);
    if (Number.isInteger(n) && n > 0) go({ top: String(n) });
  }

  // --- the selector ----------------------------------------------------------------
  const result = $derived(game.explore({ range, groupBy, top, fleetId: fleet || undefined }));

  /** Sim-days covered by the buckets, so tokens read per day whatever the range. */
  const days = $derived(Math.max(1, (result.bucketT.length * result.bucketHours) / HOURS_PER_DAY));

  /** Typed link → hash; the only place this room builds one. Customers have no door yet. */
  function linkHref(link: ExploreLink | null): string | null {
    if (link === null) return null;
    switch (link.kind) {
      case 'fleet':
        return href({ room: 'fleet', id: link.id });
      case 'workload':
        return href({ room: 'fleet', id: link.fleetId });
      case 'tier':
        return href({ room: 'routing', query: { tier: link.id } });
      case 'customer':
        return null;
    }
  }

  const chartSeries = $derived(result.series.map((s) => ({ key: s.key, label: s.label, values: s.values })));

  function onSeriesClick(s: { key: string }): void {
    const found = result.series.find((x) => x.key === s.key);
    const to = found ? linkHref(found.link) : null;
    if (to) router.navigate(to);
  }

  const barItems = $derived(
    result.series.map((s: ExploreSeries) => {
      const to = linkHref(s.link);
      return {
        key: s.key,
        label: s.label,
        value: s.total,
        share: result.total > 0 ? s.total / result.total : 0,
        hint: `${tokens(s.tokens / days)}/day`,
        ...(to ? { href: to } : {}),
      };
    }),
  );

  const bucketLabel = $derived(result.bucketHours === 1 ? '1 h' : '24 h');
  const chipClearHref = $derived(href(routeWith({ fleet: '' })));
</script>

<div class="room">
  <header class="head">
    <h2>Spend Explorer</h2>
    <p class="lede dim">Token cost plus reserved capacity, by whatever you group on. Rows are doors; nothing here is a lever.</p>
  </header>

  <div class="controls">
    <label class="field">
      <span class="lbl">range</span>
      <select class="input" value={range} onchange={(e) => go({ range: (e.currentTarget as HTMLSelectElement).value })} title="How far back the buckets reach">
        {#each RANGES as r (r.value)}
          <option value={r.value}>{r.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span class="lbl">group by</span>
      <select class="input" value={groupBy} onchange={(e) => go({ group: (e.currentTarget as HTMLSelectElement).value })} title="What each series is">
        {#each GROUPS as g (g.value)}
          <option value={g.value}>{g.label}</option>
        {/each}
      </select>
    </label>
    <label class="field narrow">
      <span class="lbl">top</span>
      <input class="input" type="number" min="1" step="1" value={top} onchange={onTopInput} title="Keep the largest N series; the rest fold into other" />
    </label>
    <label class="field">
      <span class="lbl">fleet</span>
      <select class="input" value={fleet} onchange={(e) => go({ fleet: (e.currentTarget as HTMLSelectElement).value })} title="Filter to one fleet's workloads before grouping">
        <option value="">all fleets</option>
        {#each fleetOrder as id (id)}
          <option value={id}>{id}</option>
        {/each}
      </select>
    </label>
    {#if fleet}
      <span class="pill chip mono" aria-label="filter: fleet {fleet}">
        <span class="dim">fleet:</span>
        <span>{fleet}</span>
        <a class="clear" href={chipClearHref} title="Clear the fleet filter" aria-label="clear fleet filter">×</a>
      </span>
    {/if}
  </div>

  <Panel title="spend over time" subtitle="stacked · {bucketLabel} buckets · click a legend entry to open its door">
    <TimeSeries
      bucketT={result.bucketT}
      series={chartSeries}
      stacked
      money
      height={220}
      formatY={money}
      formatX={clockLabel}
      onSeriesClick={onSeriesClick}
    />
  </Panel>

  <Panel title="spend by {groupBy}" subtitle="total over the range · share · tokens per day">
    <BarList items={barItems} fmt={money} tone={barItems.length === 1 ? 'money' : 'series'} />
    <p class="foot mono dim">
      range total <span class="money">{money(result.total)}</span> · {num(result.bucketT.length)} buckets of {bucketLabel} · {tokens(result.tokens)} tokens
    </p>
  </Panel>
</div>

<style>
  .room {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .head h2 {
    font-size: 1.15em;
  }
  .lede {
    margin-top: 0.2em;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--gap);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    min-width: 9rem;
  }
  .field.narrow {
    min-width: 5rem;
  }
  .lbl {
    font-size: 0.8em;
    color: var(--fg-muted);
    letter-spacing: 0.03em;
  }
  .chip {
    align-self: flex-end;
    margin-bottom: 0.2em;
  }
  .clear {
    color: var(--fg);
    text-decoration: none;
    padding: 0 0.2em;
  }
  .clear:hover {
    color: var(--accent);
  }
  .foot {
    margin-top: 0.75em;
    font-size: 0.85em;
  }
</style>
