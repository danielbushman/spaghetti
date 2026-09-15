<!--
  Fleet detail — investigate one fleet, then act (plan §4.4, §7 T7).

  Header and the co-founder's notes; the workloads with the tier each one
  resolved to and the rule that chose it; the 7-day token curve by tier; the
  error budget; the fleet's incidents. The primary lever is routing policy
  plus concurrency. The retry policy sits below it, visually secondary, until
  an Incidents room exists (§9.9).

  Every control carries its real term and a one-line definition. The only
  projection on the page — "last 7d at <tier>: $X/day" — is recorded tokens
  re-priced at a listed price, never a recommendation.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { game } from '../stores/game.svelte';
  import { router } from '../router.svelte';
  import { href } from '../router';
  import { clockLabel, money, moneyPerDay, num, pct, slots as fmtSlots, tokens } from '../format';
  import { simClock, sinceLogin } from '../../sim/time';
  import type { Tier } from '../../sim/types';
  import type { FleetDetail, FleetWorkloadRow, Incident } from '../../sim/metrics';
  import { TIER_ORDER } from '../../sim/metrics';
  import Panel from '../components/Panel.svelte';
  import DataTable from '../components/DataTable.svelte';
  import StatusPill from '../components/StatusPill.svelte';
  import TierBadge from '../components/TierBadge.svelte';
  import TimeSeries from '../components/TimeSeries.svelte';
  import Note from '../components/Note.svelte';

  type Status = 'paused' | 'storm' | 'idle' | 'active';
  type Policy = 'inherit' | Tier;

  /** Attempts per job above which a fleet is in a retry storm (the incident's own threshold). */
  const STORM_ATTEMPTS = 1.5;
  /** Utilisation below which a provisioned fleet with an empty queue is idle. */
  const IDLE_UTILIZATION = 0.05;
  /** Priority of the fleet-scoped operator rule; below the co-founder's 50, above a global 1. */
  const FLEET_RULE_PRIORITY = 10;
  const CONCURRENCY_STEP = 25;
  const MAX_ATTEMPTS_MIN = 1;
  const MAX_ATTEMPTS_MAX = 5;

  const constants = game.run.config.constants;

  const fleetId = $derived(router.current.id ?? '');
  const detail = $derived<FleetDetail | null>(fleetId === '' ? null : game.fleet(fleetId));

  // --- status (same derivation as the Fleets table) --------------------------------
  function statusOf(f: FleetDetail): Status {
    if (f.status === 'paused') return 'paused';
    if (f.attemptsPerJob > STORM_ATTEMPTS) return 'storm';
    if (f.utilization < IDLE_UTILIZATION && f.slots > constants.SCALE_TO_ZERO_MIN_SLOTS && f.queueDepth === 0) return 'idle';
    return 'active';
  }

  // --- routing policy ------------------------------------------------------------------
  const fleetRuleId = $derived(`op-fleet-${fleetId}`);
  /** The fleet-scoped operator rule if one exists; otherwise the fleet inherits the rules table. */
  const policy = $derived.by((): Policy => {
    const rule = game.state.routing.find((r) => r.id === fleetRuleId);
    return rule ? rule.tier : 'inherit';
  });

  /** Σ over the fleet's workloads of last week's tokens re-priced at each tier, per day. */
  const repriced = $derived.by((): Record<Tier, number> => {
    const out: Record<Tier, number> = { small: 0, medium: 0, frontier: 0 };
    for (const w of detail?.workloads ?? []) for (const tier of TIER_ORDER) out[tier] += w.repricedPerDay[tier];
    return out;
  });

  function setPolicy(ev: Event): void {
    const value = (ev.currentTarget as HTMLSelectElement).value as Policy;
    if (value === 'inherit') {
      game.dispatch({ type: 'routing.remove', ruleId: fleetRuleId });
      return;
    }
    game.dispatch({
      type: 'routing.set',
      rule: { id: fleetRuleId, priority: FLEET_RULE_PRIORITY, match: { fleetId }, tier: value, author: 'operator' },
    });
  }

  // --- fleet policy ---------------------------------------------------------------------
  function setConcurrency(ev: Event): void {
    const raw = Number((ev.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { concurrency: Math.max(0, Math.round(raw)) } });
  }

  function setScaleToZero(ev: Event): void {
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { scaleToZero: (ev.currentTarget as HTMLInputElement).checked } });
  }

  function togglePause(): void {
    if (!detail) return;
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { status: detail.status === 'paused' ? 'active' : 'paused' } });
  }

  // TODO(incidents): the retry policy moves to the Incidents room once one exists (plan §5.6, §11).
  function setMaxAttempts(ev: Event): void {
    const raw = Number((ev.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const maxAttempts = Math.min(MAX_ATTEMPTS_MAX, Math.max(MAX_ATTEMPTS_MIN, Math.round(raw)));
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { retry: { maxAttempts } } });
  }

  function setBackoff(ev: Event): void {
    const backoff = (ev.currentTarget as HTMLSelectElement).value === 'exponential' ? 'exponential' : 'none';
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { retry: { backoff } } });
  }

  function setBreaker(ev: Event): void {
    game.dispatch({ type: 'fleet.policy', fleetId, patch: { retry: { circuitBreaker: (ev.currentTarget as HTMLInputElement).checked } } });
  }

  // --- charts ------------------------------------------------------------------------------
  const tokenSeries = $derived(
    TIER_ORDER.map((tier) => ({
      key: tier,
      label: tier,
      values: (detail?.tokenCurve7d ?? []).map((p) => p.byTier[tier]),
    })),
  );
  const tokenBucketT = $derived((detail?.tokenCurve7d ?? []).map((p) => p.t));

  /** Axis label: `wk 3 · d 2 · 14:00` shortened to the day and hour. */
  function hourLabel(t: number): string {
    const c = simClock(sinceLogin(t));
    const wk = c.week < 0 ? `−${-c.week}` : String(c.week);
    return `wk ${wk} · d ${c.day} · ${String(c.hour).padStart(2, '0')}h`;
  }

  // --- error budget -----------------------------------------------------------------------------
  const budget = $derived.by(() => {
    const used = detail?.errorBudgetUsed ?? 0;
    const state: 'good' | 'warn' | 'bad' = used >= 1 ? 'bad' : used >= 0.5 ? 'warn' : 'good';
    const word = used >= 1 ? 'over budget' : used >= 0.5 ? 'half used' : 'within budget';
    return { used, state, word, width: Math.min(1, used) };
  });

  // --- workloads table ----------------------------------------------------------------------------
  function repriceTitle(w: FleetWorkloadRow): string {
    return TIER_ORDER.map((tier) => `last 7d at ${tier}: ${moneyPerDay(w.repricedPerDay[tier])}`).join(' · ');
  }

  /** Mirrors DataTable's column shape for `FleetWorkloadRow`. */
  interface Column {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    format?: (row: FleetWorkloadRow) => string;
    cell?: Snippet<[FleetWorkloadRow]>;
    title?: string;
  }

  const workloadColumns: Column[] = [
    { key: 'name', label: 'workload', sortable: true },
    { key: 'sizeClass', label: 'size class', sortable: true, cell: sizeCell, title: 'trivial ≤ 500 · standard ≤ 4 000 · heavy, by mean tokens per job' },
    { key: 'tier', label: 'tier · rule', sortable: true, cell: tierCell, title: 'the model tier this workload resolves to, and the routing rule that chose it' },
    { key: 'avgTokensPerJob', label: 'avg tok / job', sortable: true, align: 'right', format: (w: FleetWorkloadRow) => tokens(w.avgTokensPerJob) },
    { key: 'jobsPerHour', label: 'jobs / h', sortable: true, align: 'right', format: (w: FleetWorkloadRow) => num(w.jobsPerHour) },
    { key: 'costPerDay', label: 'cost / day', sortable: true, align: 'right', cell: costCell, title: 'tokens plus this workload’s share of reserved slots, trailing 24 h' },
    { key: 'errorRate', label: 'error %', sortable: true, align: 'right', format: (w: FleetWorkloadRow) => pct(w.errorRate) },
    { key: 'minTier', label: 'eval floor', sortable: true, cell: floorCell, title: 'the lowest tier that passes this workload’s eval; routing below it is penalised' },
  ];

  function pillOf(i: Incident): 'storm' | 'breached' {
    return i.kind === 'retry-storm' ? 'storm' : 'breached';
  }
</script>

{#snippet sizeCell(w: FleetWorkloadRow)}
  <span class="chip">{w.sizeClass}</span>
{/snippet}

{#snippet tierCell(w: FleetWorkloadRow)}
  <span class="tier-rule">
    <TierBadge tier={w.tier} />
    <span class="rule dim">{w.ruleId ?? 'default'}</span>
  </span>
{/snippet}

{#snippet costCell(w: FleetWorkloadRow)}
  <span class="money" title={repriceTitle(w)}>{money(w.costPerDay)}</span>
{/snippet}

{#snippet floorCell(w: FleetWorkloadRow)}
  <span class="chip">eval ≥ {w.minTier}</span>
{/snippet}

{#if detail === null}
  <div class="room">
    <div class="panel missing">
      <p>no such fleet<span class="mono dim">{fleetId === '' ? '' : ` · ${fleetId}`}</span></p>
      <a href={href({ room: 'fleets' })}>← all fleets</a>
    </div>
  </div>
{:else}
  {@const f = detail}
  {@const kind = statusOf(f)}
  <div class="room">
    <header class="head">
      <div class="titles">
        <div class="name-row">
          <h2 class="mono">{f.name}</h2>
          <StatusPill status={kind} />
        </div>
        <p class="dim">{f.role} · {f.family}</p>
        <p class="mix" aria-label="tier mix, trailing 24 h">
          {#each TIER_ORDER as tier (tier)}
            {#if f.tierMix[tier] > 0}
              <TierBadge {tier} share={f.tierMix[tier]} />
            {/if}
          {/each}
        </p>
        <p class="facts mono">
          <span class="money">{moneyPerDay(f.costPerDay)}</span>
          <span class="dim">·</span>
          <span>{tokens(f.tokensPerDay)} tok/day</span>
          <span class="dim">·</span>
          <span>queue {num(f.queueDepth)}</span>
          <span class="dim">·</span>
          <span>{fmtSlots(f.slots)} slots</span>
          <span class="dim">·</span>
          <span>util {pct(f.utilization, 0)}</span>
          <span class="dim">·</span>
          <span>serves {f.serves.map((c) => c.name).join(', ')}</span>
        </p>
      </div>
      <nav class="doors" aria-label="doors">
        <a class="btn" href={href({ room: 'spend', query: { group: 'workload', fleet: f.id } })}>Spend Explorer →</a>
        <a class="btn" href={href({ room: 'routing' })}>Routing →</a>
      </nav>
    </header>

    {#if f.notes.length > 0}
      <div class="notes">
        {#each f.notes as note, i (i)}
          <Note {note} />
        {/each}
      </div>
    {/if}

    <Panel title="workloads" subtitle="trailing 24 h; hover a cost for the same tokens at each tier">
      <DataTable columns={workloadColumns} rows={f.workloads} rowKey={(w) => w.id} sortKey="costPerDay" sortDir="desc" />
    </Panel>

    <div class="two">
      <Panel title="tokens · 7d" subtitle="by model tier, per sim-hour">
        <TimeSeries bucketT={tokenBucketT} series={tokenSeries} stacked height={180} formatY={(v) => tokens(v)} formatX={hourLabel} />
      </Panel>

      <Panel title="error budget" subtitle="failed jobs against a {pct(constants.ERROR_BUDGET_SLO_MISS, 1)} miss allowance over 7 days">
        <div class="budget">
          <p class="mono">
            <span class="value">{pct(budget.used, 0)}</span>
            <span class="dim">of 7-day budget used</span>
          </p>
          <div class="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budget.width * 100)} aria-label="error budget used">
            <span class="fill tone-{budget.state}" style:width="{(budget.width * 100).toFixed(1)}%"></span>
          </div>
          <div class="budget-row">
            <StatusPill status={budget.state} label={budget.word} />
            <span class="mono">{num(f.attemptsPerJob, 2)} attempts / job</span>
            <span class="mono dim">error {pct(f.errorRate)}</span>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="policy" subtitle="routing and capacity for this fleet">
      <div class="controls">
        <div class="control">
          <label for="routing-policy">routing policy</label>
          <select id="routing-policy" class="input mono" value={policy} onchange={setPolicy} title="which model tier this fleet’s workloads run on; a fleet-scoped rule at priority {FLEET_RULE_PRIORITY}">
            <option value="inherit">inherit rules</option>
            {#each TIER_ORDER as tier (tier)}
              <option value={tier}>{tier}</option>
            {/each}
          </select>
          <p class="def dim">inherit rules: the routing table decides. A tier: a fleet-scoped rule at priority {FLEET_RULE_PRIORITY} sends every workload here to it.</p>
          <ul class="reprice mono" aria-label="last 7 days re-priced">
            {#each TIER_ORDER as tier (tier)}
              <li class:current={policy === tier}>
                <span class="dim">last 7d at {tier}:</span>
                <span class="money">{moneyPerDay(repriced[tier])}</span>
              </li>
            {/each}
          </ul>
        </div>

        <div class="control">
          <label for="concurrency">concurrency</label>
          <input
            id="concurrency"
            class="input mono"
            type="number"
            min="0"
            step={CONCURRENCY_STEP}
            value={f.policy.concurrency}
            onchange={setConcurrency}
            title="reserved slots kept warm for this fleet; each costs {money(constants.SLOT_HOUR_PRICE)} per slot-hour"
          />
          <p class="def dim">reserved slots kept warm for this fleet; each costs {money(constants.SLOT_HOUR_PRICE)} per slot-hour whether it is used or not.</p>
        </div>

        <div class="control">
          <label class="check">
            <input type="checkbox" checked={f.policy.scaleToZero} onchange={setScaleToZero} />
            <span>scale to zero{f.policy.scaleToZero ? ' · on' : ' · off'}</span>
          </label>
          <p class="def dim">slots follow demand with {constants.SCALE_TO_ZERO_MIN_SLOTS} warm slots minimum instead of the concurrency above.</p>
        </div>

        <div class="control">
          <button type="button" class="btn" onclick={togglePause}>
            <span class="mono" aria-hidden="true">{f.status === 'paused' ? '▶' : '‖'}</span>
            <span>{f.status === 'paused' ? 'resume' : 'pause'}</span>
          </button>
          <p class="def dim">
            paused: arrivals queue, nothing is processed, no tokens, no reserved slots. After {constants.SLA_BACKLOG_HOURS} h the queue breaches
            {f.serves.length} customer{f.serves.length === 1 ? '' : 's'}: {money(f.serves.reduce((s, c) => s + c.arrPerMonth, 0))}/mo revenue.
          </p>
        </div>
      </div>

      <!-- TODO(incidents): moves to the Incidents room -->
      <section class="retry" aria-label="retry policy">
        <h4>retry policy</h4>
        <div class="controls">
          <div class="control">
            <label for="max-attempts">max attempts</label>
            <input id="max-attempts" class="input mono" type="number" min={MAX_ATTEMPTS_MIN} max={MAX_ATTEMPTS_MAX} step="1" value={f.policy.retry.maxAttempts} onchange={setMaxAttempts} />
            <p class="def dim">how many times a job is tried before it is dropped; every attempt burns its prompt tokens.</p>
          </div>
          <div class="control">
            <label for="backoff">backoff</label>
            <select id="backoff" class="input mono" value={f.policy.retry.backoff} onchange={setBackoff}>
              <option value="none">none</option>
              <option value="exponential">exponential</option>
            </select>
            <p class="def dim">exponential: retries wait longer each time, which lets the dependency recover.</p>
          </div>
          <div class="control">
            <label class="check">
              <input type="checkbox" checked={f.policy.retry.circuitBreaker} onchange={setBreaker} />
              <span>circuit breaker{f.policy.retry.circuitBreaker ? ' · on' : ' · off'}</span>
            </label>
            <p class="def dim">
              above {pct(constants.BREAKER_TRIP, 0)} error rate the breaker opens: one attempt per job, failures re-queued, until errors fall below {pct(constants.BREAKER_RESET, 0)}.
            </p>
          </div>
        </div>
      </section>
    </Panel>

    <Panel title="incidents" subtitle={f.incidents.length === 0 ? undefined : `${f.incidents.length} open`}>
      {#if f.incidents.length === 0}
        <p class="dim">no open incidents on this fleet</p>
      {:else}
        <ul class="incidents">
          {#each f.incidents as i (i.id)}
            <li class="incident">
              <StatusPill status={pillOf(i)} label={i.kind} />
              <span class="summary">{i.summary}</span>
              <span class="money">{moneyPerDay(i.costPerDay)}</span>
              <span class="mono dim">since {clockLabel(i.since)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>
  </div>
{/if}

<style>
  .room {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .missing {
    display: grid;
    gap: 0.5em;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--gap);
  }
  .titles {
    display: grid;
    gap: 0.25em;
    min-width: 0;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 0.8em;
    flex-wrap: wrap;
  }
  h2 {
    font-size: 1.3em;
  }
  .mix {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8em;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: 0.9em;
  }
  .doors {
    display: flex;
    gap: 0.5em;
    flex: none;
  }
  .doors .btn:hover {
    text-decoration: none;
  }
  .notes {
    display: grid;
    gap: 0.6em;
    padding: 0 0.2em;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--gap);
  }
  .chip {
    display: inline-block;
    padding: 0 0.5em;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 0.85em;
    font-family: var(--font-ui);
    white-space: nowrap;
  }
  .tier-rule {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
  }
  .rule {
    font-size: 0.85em;
  }
  .budget {
    display: grid;
    gap: 0.6em;
  }
  .budget .value {
    font-size: 1.5em;
    font-weight: 600;
    margin-right: 0.4em;
  }
  .meter {
    height: 0.7em;
    background: var(--bg-3);
    border-radius: 3px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .fill.tone-good { background: var(--good); }
  .fill.tone-warn { background: var(--warn); }
  .fill.tone-bad { background: var(--bad); }
  .budget-row {
    display: flex;
    align-items: center;
    gap: 0.8em;
    flex-wrap: wrap;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--gap);
  }
  .control {
    display: grid;
    gap: 0.35em;
    align-content: start;
  }
  .control label {
    font-family: var(--font-ui);
    font-size: 0.85em;
    color: var(--fg-muted);
  }
  .control .input {
    max-width: 14rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    color: var(--fg) !important;
    font-size: 1em !important;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
  }
  .def {
    font-size: 0.8em;
    max-width: 30rem;
  }
  .reprice {
    list-style: none;
    margin: 0.2em 0 0;
    padding: 0;
    display: grid;
    gap: 0.15em;
    font-size: 0.9em;
  }
  .reprice li {
    display: flex;
    gap: 0.5em;
    padding-left: 0.6em;
    border-left: 2px solid transparent;
  }
  .reprice li.current {
    border-left-color: var(--accent);
  }
  .retry {
    margin-top: var(--gap);
    padding-top: var(--gap);
    border-top: 1px dashed var(--line);
    display: grid;
    gap: 0.6em;
  }
  .retry h4 {
    font-size: 0.85em;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
    grid-template-columns: auto 1fr auto auto;
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
  }
</style>
