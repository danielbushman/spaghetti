<!--
  Models & Routing — the biggest lever (plan §4.4, §7 T8).

  One decision per screen: routing rules. Everything else here is a fact
  read off the ledger — the rules table, the effective-routing grid and the
  three models' prices. The grid's "re-priced at S / M / F" column is last
  week's recorded tokens at each listed price: a reading, never advice.
  Where a re-pricing would cross a workload's eval floor, the count of such
  workloads sits beside the price, so the penalty is as visible as the saving.

  Reads `game.routing` inside `$derived`; writes only via `game.dispatch`.
-->
<script lang="ts">
  import { TIER_RANK, type RoutingRule, type RoutingMatch, type SizeClass, type Tier } from '../../sim/types';
  import { SIZE_CLASS_ORDER, TIER_ORDER, type RoutingRow, type RoutingWorkload } from '../../sim/metrics';
  import { game } from '../stores/game.svelte';
  import { router } from '../router.svelte';
  import { href } from '../router';
  import { money, moneyPerDay, num, pct, tokens } from '../format';
  import DataTable from '../components/DataTable.svelte';
  import Panel from '../components/Panel.svelte';
  import TierBadge from '../components/TierBadge.svelte';

  const table = $derived(game.routing);
  const models = $derived(game.state.world.models);
  const fleetOrder = $derived(game.state.world.fleetOrder);

  /** The column `#/routing?tier=` asks to outline; anything else outlines nothing. */
  const highlightTier = $derived.by<Tier | null>(() => {
    const q = router.current.query.tier;
    return q === 'small' || q === 'medium' || q === 'frontier' ? q : null;
  });

  // --- rules table ------------------------------------------------------------

  const rows = $derived([...table.rows].sort((a, b) => a.rule.priority - b.rule.priority || a.rule.id.localeCompare(b.rule.id)));

  /** `fleet summarizer-east · class trivial`; an empty match fits every workload. */
  function matchText(m: RoutingMatch): string {
    const parts: string[] = [];
    if (m.fleetId) parts.push(`fleet ${m.fleetId}`);
    if (m.sizeClass) parts.push(`class ${m.sizeClass}`);
    if (m.workloadId) parts.push(`workload ${m.workloadId}`);
    return parts.length === 0 ? 'every workload' : parts.join(' · ');
  }

  /** Distinct fleets a rule currently decides for — the doors out of a rule. */
  function fleetsCovered(row: RoutingRow): string[] {
    const seen = new Set<string>();
    for (const id of row.workloadsCovered) {
      const w = table.workloads.find((x) => x.id === id);
      if (w) seen.add(w.fleetId);
    }
    return [...seen];
  }

  function setRuleTier(rule: RoutingRule, tier: Tier): void {
    if (tier === rule.tier) return;
    // Same id, so the rule is edited in place; editing makes it the operator's.
    game.dispatch({ type: 'routing.set', rule: { ...rule, tier, author: 'operator' } });
  }

  function removeRule(rule: RoutingRule): void {
    // TODO(audit-log): the event already carries t and wallMs; a log room would show who removed what, when.
    game.dispatch({ type: 'routing.remove', ruleId: rule.id });
  }

  const ruleColumns = $derived([
    { key: 'priority', label: 'priority', align: 'right' as const, title: 'Lowest number wins when several rules fit a workload', format: (r: RoutingRow) => String(r.rule.priority) },
    { key: 'match', label: 'match', title: 'Every present field must equal the workload\'s fleet, size class or id', format: (r: RoutingRow) => matchText(r.rule.match) },
    { key: 'tier', label: 'tier', title: 'The model tier the rule sends matched work to', cell: tierCell },
    { key: 'note', label: 'note', cell: noteCell },
    { key: 'author', label: 'author', cell: authorCell },
    { key: 'covered', label: 'workloads covered', align: 'right' as const, title: 'Workloads this rule currently decides for (a lower-priority rule may shadow it)', cell: coveredCell },
    { key: 'tokensPerDay', label: 'tokens/day', align: 'right' as const, format: (r: RoutingRow) => tokens(r.tokensPerDay) },
    { key: 'costPerDay', label: 'cost/day', align: 'right' as const, cell: costCell },
    { key: 'actions', label: '', align: 'right' as const, cell: actionsCell },
  ]);

  // --- add-rule form ------------------------------------------------------------

  type SizeChoice = 'any' | SizeClass;

  let formSize = $state<SizeChoice>('any');
  let formFleet = $state('');
  let formWorkload = $state('');
  let formTier = $state<Tier>('small');
  let formPriority = $state(1);
  let formNote = $state('');

  /** Workload choices, narrowed to the chosen fleet when one is chosen. */
  const workloadChoices = $derived(formFleet ? table.workloads.filter((w) => w.fleetId === formFleet) : table.workloads);

  // A workload choice that no longer belongs to the chosen fleet is dropped.
  $effect(() => {
    if (formWorkload && !workloadChoices.some((w) => w.id === formWorkload)) formWorkload = '';
  });

  const formMatch = $derived.by<RoutingMatch>(() => {
    const m: RoutingMatch = {};
    if (formFleet) m.fleetId = formFleet;
    if (formWorkload) m.workloadId = formWorkload;
    if (formSize !== 'any') m.sizeClass = formSize;
    return m;
  });

  /** The workloads the draft rule's match fits (the same predicate `resolveTier` uses). */
  const matched = $derived(
    table.workloads.filter(
      (w) =>
        (formMatch.fleetId === undefined || w.fleetId === formMatch.fleetId) &&
        (formMatch.workloadId === undefined || w.id === formMatch.workloadId) &&
        (formMatch.sizeClass === undefined || w.sizeClass === formMatch.sizeClass),
    ),
  );

  /** Σ last-7-day tokens of the matched set, re-priced at the draft tier, per day. */
  const formReprice = $derived(matched.reduce((sum, w) => sum + w.repricedPerDay[formTier], 0));

  /** How many matched workloads have an eval floor above the draft tier — the penalty, counted. */
  const formBelowFloor = $derived(matched.filter((w) => TIER_RANK[w.minTier] > TIER_RANK[formTier]).length);

  function submitRule(ev: SubmitEvent): void {
    ev.preventDefault();
    // Ids count the routing.set events so far, so every new rule gets a fresh one.
    const sets = game.run.log.filter((e) => e.type === 'routing.set').length;
    const priority = Number.isFinite(formPriority) ? Math.max(0, Math.round(formPriority)) : 1;
    const note = formNote.trim();
    const rule: RoutingRule = {
      id: `op-${sets + 1}`,
      priority,
      match: formMatch,
      tier: formTier,
      author: 'operator',
      ...(note ? { note } : {}),
    };
    game.dispatch({ type: 'routing.set', rule });
    formNote = '';
  }

  // --- effective-routing grid -----------------------------------------------------

  const gridTotal = $derived.by(() => {
    let total = 0;
    for (const sc of SIZE_CLASS_ORDER) for (const tier of TIER_ORDER) total += table.grid[sc][tier].costPerDay;
    return total;
  });

  /** 0–1 share of the grid's cost/day; the cell's background follows it. */
  function cellShare(sc: SizeClass, tier: Tier): number {
    return gridTotal > 0 ? table.grid[sc][tier].costPerDay / gridTotal : 0;
  }

  /** `at small: $4.5k/day · 0 below floor` for each tier — the reading, in full. */
  function cellTitle(sc: SizeClass, tier: Tier): string {
    const cell = table.grid[sc][tier];
    const lines = TIER_ORDER.map((at) => `at ${at}: ${moneyPerDay(cell.repricedPerDay[at])} · ${cell.belowFloor[at]} below floor`);
    return `${sc} × ${tier} — last 7d re-priced\n${lines.join('\n')}`;
  }

  const fleetHref = (id: string): string => href({ room: 'fleet', id });
</script>

{#snippet tierCell(row: RoutingRow)}
  <span class="tier-edit">
    <TierBadge tier={row.rule.tier} />
    <select
      class="input tiny"
      aria-label="tier for rule {row.rule.id}"
      title="Change the tier this rule routes to; the rule keeps its id and becomes the operator's"
      value={row.rule.tier}
      onchange={(e) => setRuleTier(row.rule, (e.currentTarget as HTMLSelectElement).value as Tier)}
    >
      {#each TIER_ORDER as t (t)}
        <option value={t}>{t}</option>
      {/each}
    </select>
  </span>
{/snippet}

{#snippet noteCell(row: RoutingRow)}
  {#if row.rule.note}
    <span class="note" class:cofounder={row.rule.author === 'cofounder'}>{row.rule.note}</span>
  {:else}
    <span class="dim">—</span>
  {/if}
{/snippet}

{#snippet authorCell(row: RoutingRow)}
  <span class="pill chip">{row.rule.author}</span>
{/snippet}

{#snippet coveredCell(row: RoutingRow)}
  {@const fleets = fleetsCovered(row)}
  <span class="covered" title={row.workloadsCovered.length ? row.workloadsCovered.join('\n') : 'no workload currently resolves to this rule'}>
    <span>{num(row.workloadsCovered.length)}</span>
    {#if fleets.length > 0}
      <span class="fleets">
        {#each fleets as id, i (id)}
          <a class="fleet-link" href={fleetHref(id)}>{id}</a>{i < fleets.length - 1 ? ' ' : ''}
        {/each}
      </span>
    {/if}
  </span>
{/snippet}

{#snippet costCell(row: RoutingRow)}
  <span class="money">{moneyPerDay(row.costPerDay)}</span>
{/snippet}

{#snippet actionsCell(row: RoutingRow)}
  <button
    type="button"
    class="btn tiny"
    title="Remove the rule; its workloads fall through to the next rule that fits, or the fleet default"
    aria-label="remove rule {row.rule.id}"
    onclick={() => removeRule(row.rule)}
  >
    remove
  </button>
{/snippet}

<div class="room">
  <header class="head">
    <h2>Models &amp; Routing</h2>
    <p class="lede dim">Lowest priority number wins. A rule applies to every workload its match fits.</p>
  </header>

  <Panel title="routing rules" subtitle="{num(rows.length)} rules · figures are the trailing sim-day">
    <DataTable columns={ruleColumns} rows={rows} rowKey={(r) => r.rule.id} caption="rules, lowest priority number first" />
  </Panel>

  <Panel title="add rule" subtitle="the two facts beside the button are last week's tokens at the listed price, and the eval floors that price would cross">
    <form class="add" onsubmit={submitRule}>
      <label class="field">
        <span class="lbl">size class</span>
        <select class="input" bind:value={formSize} title="Match workloads by their size class (mean tokens per job)">
          <option value="any">any</option>
          {#each SIZE_CLASS_ORDER as sc (sc)}
            <option value={sc}>{sc}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="lbl">fleet</span>
        <select class="input" bind:value={formFleet} title="Match only this fleet's workloads">
          <option value="">any</option>
          {#each fleetOrder as id (id)}
            <option value={id}>{id}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="lbl">workload</span>
        <select class="input" bind:value={formWorkload} title="Match one workload by id">
          <option value="">any</option>
          {#each workloadChoices as w (w.id)}
            <option value={w.id}>{w.id}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="lbl">tier</span>
        <select class="input" bind:value={formTier} title="The model tier matched work is sent to">
          {#each TIER_ORDER as t (t)}
            <option value={t}>{t} · {models[t].name}</option>
          {/each}
        </select>
      </label>
      <label class="field narrow">
        <span class="lbl">priority</span>
        <input class="input" type="number" min="0" step="1" bind:value={formPriority} title="Lowest number wins among the rules that fit a workload" />
      </label>
      <label class="field wide">
        <span class="lbl">note</span>
        <input class="input" type="text" bind:value={formNote} placeholder="optional" title="A note kept on the rule" />
      </label>

      <div class="facts mono">
        <span class="fact">
          <span class="dim">matches</span>
          <span>{num(matched.length)} workloads</span>
        </span>
        <span class="fact">
          <span class="dim">last 7d re-priced at {formTier}:</span>
          <span class="money">{moneyPerDay(formReprice)}</span>
        </span>
        <span class="fact" class:floor={formBelowFloor > 0}>
          {#if formBelowFloor > 0}
            <span class="glyph" aria-hidden="true">▲</span>
          {/if}
          <span>{num(formBelowFloor)} workloads below eval floor at {formTier}</span>
        </span>
      </div>

      <button type="submit" class="btn btn-accent" title="Adds the rule as a routing.set event">add rule</button>
    </form>
  </Panel>

  <Panel title="effective routing" subtitle="size class × the tier the trailing day's tokens were recorded on; hover a cell for last week's re-pricing">
    <div class="grid-scroll">
      <table class="grid" aria-label="effective routing grid">
        <thead>
          <tr>
            <th scope="col" class="corner"></th>
            {#each TIER_ORDER as tier (tier)}
              <th scope="col" class:outlined={highlightTier === tier} aria-current={highlightTier === tier ? 'true' : undefined}>
                <TierBadge {tier} />
                {#if highlightTier === tier}
                  <span class="dim tiny-text">· selected</span>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each SIZE_CLASS_ORDER as sc (sc)}
            <tr>
              <th scope="row" class="mono">{sc}</th>
              {#each TIER_ORDER as tier (tier)}
                {@const cell = table.grid[sc][tier]}
                {@const share = cellShare(sc, tier)}
                <td class="cell" class:outlined={highlightTier === tier} title={cellTitle(sc, tier)}>
                  <span class="heat" style:opacity={(share * 0.65).toFixed(3)} aria-hidden="true"></span>
                  <span class="cell-body mono">
                    <span class="money big">{moneyPerDay(cell.costPerDay)}</span>
                    <span class="dim">{tokens(cell.jobsPerDay)} jobs/day · {pct(share, 0)} of cost</span>
                    <span class="reprice dim">
                      {#each TIER_ORDER as at (at)}
                        <span class="rp" class:crosses={cell.belowFloor[at] > 0}>{at[0].toUpperCase()} {money(cell.repricedPerDay[at])}{cell.belowFloor[at] > 0 ? ` ▲${cell.belowFloor[at]}` : ''}</span>
                      {/each}
                    </span>
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="legend dim">S / M / F: last 7 days' tokens re-priced at that tier, per day. ▲n: n of the cell's workloads have an eval floor above that tier.</p>
  </Panel>

  <Panel title="models" subtitle="listed prices; no lever here">
    <div class="scroll">
      <table class="models">
        <thead>
          <tr>
            <th scope="col">tier</th>
            <th scope="col">name</th>
            <th scope="col" class="r">$ in / M tok</th>
            <th scope="col" class="r">$ out / M tok</th>
            <th scope="col" class="r">tok/s</th>
            <th scope="col" class="r">base error</th>
          </tr>
        </thead>
        <tbody>
          {#each TIER_ORDER as tier (tier)}
            {@const m = models[tier]}
            <tr class:outlined={highlightTier === tier}>
              <td><TierBadge {tier} /></td>
              <td class="mono">{m.name}</td>
              <td class="mono r money">${m.priceInPerM.toFixed(2)}</td>
              <td class="mono r money">${m.priceOutPerM.toFixed(2)}</td>
              <td class="mono r">{num(m.outTokensPerSec)}</td>
              <td class="mono r">{pct(m.baseErrorRate)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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

  /* rules table */
  .tier-edit {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
  }
  .input.tiny,
  .btn.tiny {
    padding: 0.1em 0.4em;
    font-size: 0.85em;
  }
  .note {
    font-family: var(--font-ui);
  }
  .note.cofounder {
    font-style: italic;
  }
  .chip {
    font-family: var(--font-ui);
  }
  .covered {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1em;
  }
  .fleets {
    font-size: 0.8em;
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35em;
  }
  .fleet-link {
    color: var(--fg-muted);
  }
  .fleet-link:hover {
    color: var(--fg);
  }

  /* add-rule form */
  .add {
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
  .field.wide {
    flex: 1 1 14rem;
  }
  .lbl {
    font-size: 0.8em;
    color: var(--fg-muted);
    letter-spacing: 0.03em;
  }
  .facts {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4em 1.5em;
    padding: 0.4em 0.6em;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg-2);
  }
  .fact {
    display: inline-flex;
    align-items: baseline;
    gap: 0.45em;
  }
  .fact.floor .glyph {
    color: var(--warn);
  }

  /* effective-routing grid */
  .grid-scroll,
  .scroll {
    overflow-x: auto;
  }
  .grid {
    border-collapse: separate;
    border-spacing: 4px;
    width: 100%;
  }
  .grid th,
  .grid td {
    border-bottom: none;
  }
  .grid thead th {
    font-family: var(--font-ui);
    text-align: left;
    padding: 0.3em 0.6em;
    border: 2px solid transparent;
    border-radius: 6px;
  }
  .grid tbody th {
    width: 6rem;
    color: var(--fg);
    font-weight: 500;
    vertical-align: top;
    padding-top: 0.6em;
  }
  .cell {
    position: relative;
    padding: 0;
    border: 2px solid var(--line);
    border-radius: 6px;
    background: var(--bg-2);
    vertical-align: top;
    min-width: 11rem;
  }
  .heat {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    background: var(--accent);
    pointer-events: none;
  }
  .cell-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.15em;
    padding: 0.5em 0.6em;
    font-size: 0.9em;
  }
  .big {
    font-size: 1.15em;
    font-weight: 600;
  }
  .reprice {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2em 0.7em;
    font-size: 0.85em;
    margin-top: 0.25em;
  }
  .rp.crosses {
    color: var(--warn);
  }
  /* The column `?tier=` names: an accent outline on its header and cells, plus the word "selected". */
  .grid thead th.outlined,
  .grid td.cell.outlined {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-soft);
  }
  .models tr.outlined td {
    background: var(--accent-soft);
  }
  .tiny-text {
    font-size: 0.75em;
    font-family: var(--font-ui);
  }
  .legend {
    margin-top: 0.5em;
    font-size: 0.8em;
  }

  /* models */
  .models .r {
    text-align: right;
  }
</style>
