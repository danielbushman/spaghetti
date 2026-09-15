# First Slice — Implementation Plan

> Branch: `design/v-shape-prestige` · Written: 2026-09-15
> Status: **build plan.** Derived from `01-v-shape-prestige.md` (§2 numbers, §4 console, §5 levers, §8 architecture, §9.7 first slice), the Brief v1.1, the Visual Direction v1.1 and Content & Language v1.1. Synthesised from three candidate plans after a judge panel; the winning plan (simulation-math-first) is the base, with the runners-up's best ideas grafted in where the judges praised them.
> Scope is fixed. Nothing in §10 (out of scope) is built; each has a typed hook.

---

## 1. Goal and the one loop it tests

The design doc's §9.7 asks a single question: **does finding the bleed by drill-down feel like delight?** The slice exists to answer it with a playable console over a real (aggregate, deterministic) economy. Nothing else.

The loop is the SRE loop from §4.5 — notice → investigate → act → wait → verify — walked once, by hand, on first login:

1. **Notice.** Overview. Runway ≈ 6.2 sim-months, slope ≈ −$5.6M/sim-week, one incident open (`retry-storm · halberd-monitor`). Nothing explains itself.
2. **Investigate.** Spend Explorer, group by model: the frontier tier is ≈ 58% of spend. Group by fleet: `summarizer-east` sits on top at ≈ 39%. Fleet detail: its jobs average 220 tokens and run 100% on the frontier model; the co-founder's note says why.
3. **Act.** Models & Routing. The co-founder's rule `summarizer-east → frontier · eval pending` is visible. The effective-routing grid shows the trivial × frontier cell at ≈ $440k/day. Add a rule `trivial → small`. The grid re-prices the cell from last week's tokens: ≈ $4.5k/day if routed there — a reading, not advice.
4. **Wait.** `+1 week` in the top bar (or a real day at 1×).
5. **Verify.** Slope magnitude at least halves. The top bar shows `+N wk bought`. The Overview's dashed projection to zero swings right. The Spend Explorer's frontier share collapses.

Everything in this plan is in service of that walk. The second and third bleeds (retry storm, idle fleets) exist so the walk has a second and third lap, and so that pulling all three levers crosses the inflection: the cash curve bottoms and climbs.

**Success criterion (mechanical):** `tests/console/walkthrough.test.ts` reproduces steps 1–5 headlessly and asserts every number above within tolerance. **Success criterion (human):** the maker plays it and says whether it was delight. The plan cannot test the second one; it can only make it cheap to retune (§3.6, one constants file) and cheap to re-run (`bun run sim:report`).

---

## 2. Shape of the work

Two packages under one typed contract, plus a two-entry build.

```
src/sim/       pure TypeScript. No DOM, no IO. step(state, dtHours, config, rng) → state.
               Aggregate ledger of rates; three planted bleeds; event log + replay; selectors.
src/console/   Svelte 5 runes. The game surface, served at "/". Five rooms, shell, ⌘K, time controls.
               A thin, honest window onto sim selectors. All writes go through dispatch(action).
src/client/    the pre-pivot cockpit. Untouched; served at "/cockpit/".
```

Principles the tasks inherit:

- **Real terms never lie** (design §4.3). Every number a room shows is a selector over the ledger. Where the console shows a counterfactual ("if routed to small: $X/day"), it is a re-pricing of recorded tokens, labelled as such, never a recommendation.
- **One decision per screen.** Overview and Spend Explorer hold no lever. Fleets holds pause/scale. Fleet detail holds routing policy + concurrency (and, until an Incidents room exists, the retry policy — see §5.6 and §11). Models & Routing holds the routing rules.
- **Determinism is structural.** Noise for sim-hour `h` is a pure function of `(seed, h)`; no RNG state is carried. Any chunking of ticks and any replay of the log reproduces state bit-for-bit within one JS engine.
- **Tests pin outcomes, not constants.** Bankruptcy window, flatten ratio, inflection. Tuning is a one-file edit that never rewrites a test.
- **Every algorithm lives in a plain `.ts` file** so `bun test` can import it. Rune modules (`.svelte.ts`) and components are thin wrappers and are covered by the build smoke test, not unit tests (there is no Svelte plugin under `bun test`).
- **Colorblind-safe is a hard constraint.** Status is never hue alone (glyph + label always). Chart series are Okabe–Ito with legend glyphs and dash patterns. Money keeps its own hue. Proof in §6.

---

## 3. Simulation model (`src/sim/`)

### 3.1 Time

- One tick = one sim-hour. `HOURS_PER_WEEK = 168`, `HOURS_PER_MONTH = 730`, `HOURS_PER_YEAR = 8760`.
- **Prelude.** `PRELUDE_HOURS = 672` (28 days). `createState(seed)` generates the world and runs the ledger for the prelude before the player's first login, so at login the 28-day hourly ring and the daily history are full: sparklines have shape, Spend Explorer has rows, and the slope is a real trailing-week reading. Bankruptcy is not checked during the prelude. Cash accounting during the prelude accumulates net only (cash starts at 0 and goes negative); `createState` runs the 672 prelude ticks, then — after the loop and before any post-login tick — sets `cash = OPENING_CASH` and back-fills `cashClose` in **both** the 672-entry `hourly` ring and the 28 `daily` samples as `OPENING_CASH − (netAtLogin − netAtSample)`, which is exact because costs never depend on cash. The bankruptcy guard in §3.4 step 11 reads the **pre-tick** `t` (the hour being simulated), so the last prelude tick (`t = 671`) never trips it. The player's clock reads from login: `sinceLogin(t) = t − PRELUDE_HOURS`.
- **Wall clock.** `SIM_HOURS_PER_REAL_MS = 168 / 86_400_000` (1 real day = 1 sim-week). Dev speeds `1 | 24 | 168 | 1008` multiply it (one sim-week per real day / hour / 8.6 min / 86 s). `hoursDue(stampMs, nowMs, speed, carryMs)` floors to whole hours, carries the remainder, and clamps at `MAX_CATCHUP_HOURS = 8760`. Paused wall time never accrues (the stamp moves on resume).
- `simClock(hoursSinceLogin)` → `{ week, day, hour, label }`, week and day 1-based from login, negative weeks allowed for prelude axis labels (`wk −2 · d 3 · 14:00`).

### 3.2 State shape (`src/sim/types.ts`)

```ts
export type Tier = 'small' | 'medium' | 'frontier';
export const TIER_RANK: Record<Tier, number> = { small: 0, medium: 1, frontier: 2 };
export type SizeClass = 'trivial' | 'standard' | 'heavy';
export type FleetFamily = 'ingest' | 'summarizer' | 'monitor' | 'relay' | 'ledger';

export interface ModelDef { tier: Tier; name: string; priceInPerM: number; priceOutPerM: number; outTokensPerSec: number; baseErrorRate: number }
export interface WorkloadDef {
  id: string; name: string; fleetId: string;
  jobsPerHour: number; inTokMean: number; outTokMean: number;
  sizeClass: SizeClass;            // derived from inTokMean + outTokMean at generation
  minTier: Tier;                   // the tier that passes the eval; routing below it is penalised (honest tiering)
  businessHours: boolean;          // weekday/daytime-shaped demand
  customerShares: Record<string, number>;   // customerId → share, sums to 1 (drives group-by customer)
}
export interface CoFounderNote { date: string; text: string }   // 'MM-DD'; the co-founder's voice; never addresses the player
export interface RetryPolicy  { maxAttempts: number; backoff: 'none' | 'exponential'; circuitBreaker: boolean }
export interface FleetPolicy  { status: 'active' | 'paused'; concurrency: number; scaleToZero: boolean; retry: RetryPolicy }
export interface FleetDef {
  id: string; name: string; family: FleetFamily; role: string;
  defaultTier: Tier; provisionedSlots: number; workloadIds: string[];
  notes: CoFounderNote[]; initialPolicy: FleetPolicy;
  initialStormExcess: number;      // planted retry-storm pressure (0 for healthy fleets)
}
export interface RoutingMatch { fleetId?: string; workloadId?: string; sizeClass?: SizeClass }
export interface RoutingRule  { id: string; priority: number; match: RoutingMatch; tier: Tier; note?: string; author: 'cofounder' | 'operator' }
export interface CustomerDef  { id: string; name: string; kind: 'segment' | 'account'; accounts: number; arr: number; servedBy: string[] }
export interface WorldDef {
  seed: number; models: Record<Tier, ModelDef>;
  fleets: Record<string, FleetDef>; fleetOrder: string[];
  workloads: Record<string, WorkloadDef>;
  customers: Record<string, CustomerDef>; customerOrder: string[];
  routing: RoutingRule[];          // the co-founder's initial rules
  bleeds: { tiering: string | null; retryStorm: string | null; idle: string[] };  // fleet ids; tests, report and the post-mortem hook only — never shown
}
export interface FleetRuntime {
  policy: FleetPolicy; queueDepth: number; errorRate: number; stormExcess: number;
  attemptsPerJob: number; utilization: number; slotsNeeded: number; slotsProvisioned: number; breakerOpen: boolean; slaBreached: boolean;
  // errorRate = attempt-weighted p over the hour (0 when no attempts); attemptsPerJob = attempts/processed (0 when nothing processed);
  // slotsNeeded is carried unclamped so scale-to-zero autoscaling (§3.4 step 7) never reconstructs it from a clamped utilization.
}
export interface WorkloadHour { jobs: number; attempts: number; failed: number; tokensIn: number; tokensOut: number; tokenCost: number; tier: Tier }
export interface HourSample   { t: number; cashClose: number; revenue: number; tokenCost: number; capacityCost: number; opex: number; tokens: number; byWorkload: Record<string, WorkloadHour>; capacityByFleet: Record<string, number> }
export interface DaySample    { day: number; cashClose: number; revenue: number; tokenCost: number; capacityCost: number; opex: number; tokens: number; byWorkload: Record<string, WorkloadHour>; capacityByFleet: Record<string, number> }
export interface SimState {
  version: number; seed: number;
  t: number;                        // completed sim-hours since genesis; login is at t = PRELUDE_HOURS
  cash: number; status: 'running' | 'bankrupt'; bankruptAt: number | null;
  world: WorldDef; fleets: Record<string, FleetRuntime>; routing: RoutingRule[];
  hourly: HourSample[];             // ring, last HOURLY_WINDOW hours (672 = 28 days)
  daily: DaySample[];               // whole run including prelude, one per completed sim-day
  dayAcc: DaySample | null;         // partial current day
  totals: { revenue: number; tokenCost: number; capacityCost: number; opex: number; tokens: number };
}
export interface Constants { /* every numeric knob, §3.6; T1 declares the keys (T1 spec), T3 supplies values */ }
export interface WorldParams { /* generator knobs, §3.6; keys in T1 spec */ }
export interface WorldPhysics {  // the physics the generator must share with step.ts; T3's createState fills it from CONSTANTS
  prefillTps: number; overheadS: number; diurnalAmplitude: number; hoursPerMonth: number; trivialMax: number; standardMax: number;
}
export interface SimConfig { constants: Constants }
export type Action =
  | { type: 'routing.set'; rule: RoutingRule }                  // upsert by rule.id
  | { type: 'routing.remove'; ruleId: string }
  | { type: 'fleet.policy'; fleetId: string; patch: Partial<Omit<FleetPolicy, 'retry'>> & { retry?: Partial<RetryPolicy> } };
export type SimEvent =
  | { type: 'run.start'; t: number; seed: number; wallMs: number; version: number }   // t = PRELUDE_HOURS
  | (Action & { t: number; wallMs: number })
  | { type: 'checkpoint'; t: number; hash: string };
```

`step` returns a new object and never mutates its input (tests deep-freeze the input). Structural sharing is allowed.

### 3.3 RNG (`src/sim/rng.ts`)

`createRng(seed): Rng` with `Rng = { readonly seed; forHour(h: number): HourRng; fork(label: string): HourRng }`. `forHour(h)` returns a fresh splitmix32 stream seeded by `hash32(seed, h)`; `fork(label)` seeds by `hash32(seed, fnv1a(label))` (the world generator uses `fork('world')`). `HourRng = { next(); normal(); lognormal(sigma); int(n); pick(a); shuffle(a) }`. `normal()` is Box–Muller with no cached second value so results never depend on call history; `lognormal(σ) = exp(normal()·σ − σ²/2)` so its mean is 1. **No RNG state lives in `SimState`**, which is what makes `step(s, 168) ≡ 168 × step(s, 1)` and replay trivially exact.

### 3.4 Tick math (`tickHour` in `src/sim/step.ts`)

For each fleet `f` in `fleetOrder`, for each workload `w` in `f.workloadIds` (deterministic order, one RNG draw per workload per hour):

1. **Arrivals.** `a = w.jobsPerHour × demandFactor(t, w.businessHours) × jitter`, where `hourOfDay = t mod 24`, `dayOfWeek = floor(t / 24) mod DAYS_PER_WEEK` (0-based), `demandFactor = (1 + DIURNAL_AMPLITUDE·sin(2π(hourOfDay − DIURNAL_PEAK_HOUR)/24)) × (businessHours && dayOfWeek ≥ WEEKEND_START_DAY ? WEEKEND_FACTOR : 1)` and `jitter = rng.forHour(t).lognormal(JITTER_SIGMA)`. Every number in this formula except 0, 1, 2 and 24 is a `Constants` key (§3.6); `step.ts` carries no other literals (T3).
2. **Tier.** `resolveTier(state.routing, f.id, w, f.defaultTier)`: among rules whose every present match field equals the workload's `(fleetId, workloadId, sizeClass)`, the lowest `priority` wins (ties by id); no rule → `f.defaultTier`. Returns `{ tier, ruleId }` so rooms can attribute the choice.
3. **Error rate.** `p = clamp(model.baseErrorRate + underTier + f.stormExcess, 0, MAX_ERROR_RATE)` with `underTier = UNDER_TIER_ERROR_PENALTY` when `TIER_RANK[tier] < TIER_RANK[w.minTier]` (a small model failing eval-grade work is retried; routing heavy work to small backfires honestly).
4. **Retry storm dynamics (per fleet, before its workloads).** `stormExcess' = clamp(stormExcess + STORM_GAIN × (attemptsPerJob_prev − 1) − recovery, 0, STORM_EXCESS_CAP)` where `recovery = BREAKER_RECOVERY_PER_HOUR` while the breaker is open, else `BACKOFF_RECOVERY_PER_HOUR` when `retry.backoff === 'exponential'`, else `NATURAL_RECOVERY_PER_HOUR`. Retries feed the storm; shedding them drains it. The bleed is planted as `initialStormExcess`, not scripted.
5. **Circuit breaker (hysteresis).** `breakerOpen' = circuitBreaker && (breakerOpen ? p > BREAKER_RESET : p > BREAKER_TRIP)`. While open, `maxAttempts` is forced to 1 (fail fast, shed load) and the jobs that fail are **re-queued** in step 7 (the work waits, it is not lost). With the breaker closed, a job that exhausts `maxAttempts` is dropped — that is what "retries exhausted" means.
6. **Attempts.** `m = attemptsMultiplier(p, maxAttempts) = (1 − p^maxAttempts)/(1 − p)` (1 when p = 0; `maxAttempts` when p ≥ 1 — unreachable while `MAX_ERROR_RATE < 1`, which §9.4 requires). `failed = processed × p^maxAttempts` (jobs, not attempts; re-queued jobs count here too — they burned their tokens). Error-budget consumption (display only): `Σ jobs > 0 ? Σ failed / (ERROR_BUDGET_SLO_MISS × Σ jobs) : 0` over the trailing 168 h — a budget consumed over a window, which is what the term means.
7. **Capacity.** `jobHours = jobHoursFor(inTok, outTok, model, PREFILL_TPS, JOB_OVERHEAD_S) = (inTok/PREFILL_TPS + outTok/model.outTokensPerSec + JOB_OVERHEAD_S)/3600` (single definition in `physics.ts`, T2); `slotsNeeded = Σ_w a × m × jobHours` over the fleet, stored on `FleetRuntime.slotsNeeded`. `slotsProvisioned = paused ? 0 : scaleToZero ? max(SCALE_TO_ZERO_MIN_SLOTS, ceil(fleet.slotsNeeded_prev × AUTOSCALE_HEADROOM)) : policy.concurrency`. `processed = min(a + queue, slotsProvisioned / (m × jobHours))` shared across the fleet's workloads pro rata to demand `a + queue_w` when `Σ_w (a + queue_w) > 0`, else 0 for every workload; `requeued = breakerOpen ? failed : 0`; `queue' = a + queue − processed + requeued`; `utilization = slotsProvisioned > 0 ? min(1, slotsNeeded/slotsProvisioned) : 0`. Paused fleets: arrivals queue, `processed = attempts = 0`, no tokens, no capacity. The fleet's reported `errorRate = Σ attempts > 0 ? Σ_w attempts_w·p_w / Σ attempts : 0` and `attemptsPerJob = processed > 0 ? attempts/processed : 0` — never 0/0, so a paused fleet reads 0% / 0 attempts, which is true. Re-queueing is bounded: `queue' ≤ a + queue` always, and when the fleet is not capacity-limited the queue converges to `p·a/(1 − p)`; it grows without bound only when `slotsProvisioned/(m·jobHours) × (1 − p) < a` (§9.4).
8. **Tokens.** `attempts = processed × m`; `tokensIn = attempts × inTok`; `tokensOut = processed × outTok + (attempts − processed) × outTok × FAILED_OUTPUT_FRACTION`; `tokenCost = tokensIn·priceIn/1e6 + tokensOut·priceOut/1e6`. Errors cost twice: a failed attempt burns its full prompt and half its output.
9. **Capacity cost.** `slotsProvisioned × SLOT_HOUR_PRICE` per fleet-hour. Reserved capacity is the honest home of scale-to-zero: idle compute is not tokens.
10. **SLA.** A customer is `slaBreached` this hour when any fleet in `servedBy` has `queue' > SLA_BACKLOG_HOURS × Σ_w a` (fresh arrivals this hour; re-queued jobs are in the queue, never in the denominator); breached contracts accrue no revenue that hour (100% SLA credit). Every fleet serves at least one customer (T2 step 6), so pausing any fleet costs the revenue it serves after `SLA_BACKLOG_HOURS`; §3.6 pins that each honest fix beats pausing its fleet.
11. **Ledger.** `revenue = Σ customers.arr/HOURS_PER_YEAR × (breached ? 0 : 1)`; `opex = FIXED_OPEX_PER_MONTH/HOURS_PER_MONTH`; `cash' = cash + revenue − tokenCost − capacityCost − opex`. With `t` the **pre-tick** hour being simulated: if `t ≥ PRELUDE_HOURS` and `cash' ≤ 0`: `status = 'bankrupt'`, `bankruptAt = t + 1`, cash clamped to 0, further steps are no-ops (`TODO(prestige)` hook in `events.ts`). During the prelude (`t < PRELUDE_HOURS`) cash simply accumulates net (§3.1).
12. **Bookkeeping.** Push `HourSample` (ring of `HOURLY_WINDOW`), fold into `dayAcc`, roll into `daily` every 24 h; `t += 1`. `byWorkload` entries with zero jobs and zero attempts are omitted.

`step(state, dtHours, config, rng)` requires a non-negative integer `dtHours`, loops `tickHour`, and is a no-op when bankrupt. `advanceTo(state, t, config, rng)` is the convenience the event layer uses.

### 3.5 The three bleeds

| Bleed | Term in the ledger | Aggregate tell (no per-agent data) | Lever (a real term, honest) |
|---|---|---|---|
| **(a) model tiering** | `summarizer-east` (canon): two trivial workloads (`ticket-summary`, `ticket-triage`, ≈ 220 tokens/job, `minTier: small`) with `defaultTier: 'frontier'` and a co-founder rule `{ id: 'cf-summarizer-east', priority: 50, match: { fleetId }, tier: 'frontier', author: 'cofounder', note: 'eval pending' }`. ≈ $13.4M/sim-month in tokens, ≈ 37% of cost (≈ 39% of Spend ▸ fleet once its ≈ $0.75M of reserved slots is attributed). | Spend ▸ model: frontier ≈ 60% of spend. Spend ▸ fleet: `summarizer-east` on top. Fleet detail: avg 220 tok/job, 100% frontier, the note. Routing grid: trivial × frontier cell ≈ $440k/day. | Routing rule `{ sizeClass: 'trivial' } → small` (global, priority 1) or a fleet-scoped rule. `minTier` makes routing *heavy* work to small backfire via the error penalty. |
| **(b) retry storm** | `halberd-monitor` (canon) on frontier, `retry: { maxAttempts: 5, backoff: 'none', circuitBreaker: false }`, `initialStormExcess: 0.50` and self-amplification (§3.4 step 4). With §3.6 constants the storm ramps during the prelude (+0.002/h at 0.50, accelerating) and pins at `STORM_EXCESS_CAP` by prelude hour ≈ 55, so at login it is **saturated**: p ≈ 0.61, ≈ 2.35 attempts/job, ≈ $5.5M/sim-month against ≈ $2.55M for the same work done once (≈ $2.9M/mo wasted). It does not worsen further; it stays until someone acts. Provisioned with headroom for the storm so backlog is not part of the bleed. | Overview incident `retry-storm`, open since before login. Fleets: error ≈ 61%, ≈ 2.35 attempts/job. Fleet detail: error budget burned many times over; attempts/job. | Retry policy: circuit breaker on (forces `maxAttempts` 1 at once; excess drains from 0.60 below `BREAKER_RESET` in ≈ 17 h) or backoff exponential / maxAttempts 1 (slow drain). |
| **(c) idle compute** | Six seed-chosen ingest river fleets, `provisionedSlots: 8 800` each, one trivial workload at 2 jobs/h, `scaleToZero: false`. ≈ $1.6M/sim-month each, ≈ $9.6M total. | Spend ▸ fleet: six rivers at ≈ $53k/day with ≈ 0 tokens (the tokens hint on each row). Fleets: utilization 0%, queue 0, 8 800 slots. | `scaleToZero: true` (drops to `SCALE_TO_ZERO_MIN_SLOTS` warm slots). Pausing a river also breaches the segment it serves (§3.4 step 10), so scale-to-zero is the lever that wins. |

Bleeds (a) and (c) are deliberately **not** incidents. They are found by drill-down. Only the retry storm is an incident, and it is open at first login (intro beat 6: one incident already open).

**Why the storm is emergent, not scripted.** A scripted upstream error ramp cannot be fixed by a circuit breaker, so the term would lie. With planted pressure plus gain-from-retries, the breaker does exactly what it does in industry: sheds retries, lets the dependency recover, closes when the error rate falls below the reset threshold.

### 3.6 Constants with numbers (`src/sim/constants.ts` — the single tuning file)

```
OPENING_CASH              150_000_000
ARR_TOTAL                 140_000_000      (revenue 11.67M / sim-month, accrued hourly)
FIXED_OPEX_PER_MONTH        3_800_000
SLOT_HOUR_PRICE                  0.25      $/reserved slot-hour
HOURS_PER_WEEK 168 · HOURS_PER_MONTH 730 · HOURS_PER_YEAR 8760 · HOURLY_WINDOW 672 (= PRELUDE_HOURS)
DAYS_PER_WEEK 7 · DIURNAL_PEAK_HOUR 14 · WEEKEND_START_DAY 5      (0-based day of week; days 5 and 6 are the weekend)
TIERS  small    { name 'spaghetti-s',  priceInPerM 0.10, priceOutPerM  0.40, outTokensPerSec 150, baseErrorRate 0.005 }
       medium   { name 'spaghetti-m',  priceInPerM 1.00, priceOutPerM  4.00, outTokensPerSec  80, baseErrorRate 0.008 }
       frontier { name 'spaghetti-xl', priceInPerM 10.0, priceOutPerM 40.00, outTokensPerSec  35, baseErrorRate 0.010 }
PREFILL_TPS 4000 · JOB_OVERHEAD_S 0.5
SIZE_CLASS_TRIVIAL_MAX 500 · SIZE_CLASS_STANDARD_MAX 4000       (mean in + out tokens)
UNDER_TIER_ERROR_PENALTY 0.30 · FAILED_OUTPUT_FRACTION 0.5 · MAX_ERROR_RATE 0.9
STORM_GAIN 0.004 · STORM_EXCESS_CAP 0.60 · NATURAL_RECOVERY_PER_HOUR 0.002
BREAKER_TRIP 0.20 · BREAKER_RESET 0.10 · BREAKER_RECOVERY_PER_HOUR 0.03 · BACKOFF_RECOVERY_PER_HOUR 0.01
SCALE_TO_ZERO_MIN_SLOTS 25 · AUTOSCALE_HEADROOM 1.2
DIURNAL_AMPLITUDE 0.25 · WEEKEND_FACTOR 0.7 · JITTER_SIGMA 0.08
SLA_BACKLOG_HOURS 24 · ERROR_BUDGET_SLO_MISS 0.005 · CHECKPOINT_EVERY_HOURS 168 · SIM_VERSION 1
DEFAULT_WORLD_PARAMS (WorldParams):
  fleetCount 40 · idleFleetCount 6 · idleSlotsPerFleet 8_800 · idleJobsPerHour 2
  bleeds { tiering: true, retryStorm: true, idle: true }           ← scenario switch for report.ts and tests
  bleedA { jobsPerHour 5_400_000, inTok 180, outTok 40, split [0.7, 0.3] }
        → ≈ 870B tok/mo; on frontier ≈ $13.4M/mo; on small ≈ $0.13M/mo
        → slots: 5.4M × jobHours(frontier 0.000469 h) × (1 + DIURNAL 0.25) × headroom 1.3 = 4 114 → ≈ $0.75M/mo reserved
  bleedB { jobsPerHour 41_500, inTok 6_000, outTok 600, maxAttempts 5, stormExcess0 0.50, stormPeakP 0.61, slotHeadroom 1.3 }
        → base ≈ $2.55M/mo; saturated at the cap (p 0.61, 2.35 attempts, errors cost twice) ≈ $5.5M; fixed ≈ $2.55M
        → slots ≈ 220 × 2.35 × 1.25 × 1.3 ≈ 840 → ≈ $0.15M/mo reserved
  healthyTokensPerMonth 1.2e12 · healthyTierMix { small 0.55, medium 0.40, frontier 0.05 } · healthyOutFraction 0.20
        → ≈ $1.8M/mo (the out-fraction is pinned because output tokens cost 4× input: at 50/50 the same line is $2.9M)
  healthySlotsTotal 5_000 (≈ $0.9M/mo) · provisionHeadroom 1.3
  arrTotal 140e6
  namedAccounts [ Halberd Capital 9.0M → monitor · Meridian Logistics 3.2M → relay · Northgate Clinics 2.1M → relay · Tessellate Media 1.4M → summarizer ]
  segments [ smb 3_900 accts 0.28 · mid-market 900 accts 0.34 · enterprise 120 accts 0.22 · public-sector 60 accts 0.09 · fintech 40 accts 0.07 ]   (arrShare of the non-named remainder, 124.3M)
  homeSegments { 'summarizer-east': ['smb'], 'halberd-monitor': ['enterprise', 'fintech'] }   ← pinned; every other fleet gets one seed-spread home segment (T2 step 6)
```

**Opening P&L per sim-month (targets, ±10%):** revenue 11.67 · tokens ≈ 20.7 (healthy 1.8 + A 13.4 + B 5.5) · capacity ≈ 11.4 (healthy 0.9 + A's slots 0.75 + B's slots 0.15 + C 9.6) · opex 3.8 → cost ≈ 36.0, **burn ≈ 24.3** (≈ −$5.6M/wk), runway 150/24.3 ≈ 6.2 mo ≈ **27 sim-weeks**, the middle of the [23, 30] bankruptcy window (which is exactly the opening-slope window [−6.5M, −5.0M]/wk expressed in weeks: 150/6.5 = 23.1, 150/5.0 = 30). Nothing worsens after login (the storm is already at its cap), so bankruptcy lands where the opening slope says. Tokens ≈ 2.6T/mo.

**Reachability of the inflection.** Fix all three at login → tokens ≈ 4.5 (1.8 + 0.13 + 2.55) + capacity ≈ 1.85 (healthy 0.9 + A's 0.75 stay provisioned until the player scales them + B 0.15 + C 0.03) + opex 3.8 ≈ 10.1 < 11.67 → **≈ +$1.5M/sim-month**; cash bottoms and climbs. Scale-to-zero on `summarizer-east` (now on small, at peak 1 522 × 1.2 = 1 826 slots ≈ $0.33M) lifts it to ≈ +$2.0M. Fix (a) alone → burn ≈ 11.0 (slope ratio ≈ 0.45). Fix (b) alone → ≈ 21.4. Fix (c) alone → ≈ 14.7. Fix (a)+(b) → ≈ 8.1.

**Pause is priced, and the honest fix wins.** Every fleet serves at least one segment, and a paused fleet breaches it after `SLA_BACKLOG_HOURS`: pause `summarizer-east` alone → cost −14.15 but revenue −2.9 (smb) −0.12 (Tessellate) → burn ≈ 13.2, worse than fix (a) ≈ 11.0. Pause `halberd-monitor` alone → cost −5.65 but revenue −2.28 (enterprise) −0.73 (fintech) −0.75 (Halberd Capital) → burn ≈ 22.5, worse than fix (b) ≈ 21.4. Pause both (the top two rows of Fleets by cost/day) → burn ≈ 11.3, worse than fix (a)+(b) ≈ 8.1. Pause an idle river → saves 1.6, loses its segment (≥ 0.73) — and scale-to-zero saves the same 1.6 for nothing. Pausing every fleet → revenue 0, burn = opex 3.8: slower death, never a win. These orderings are economy tests (§6), so the tuning has a target.

The margin after all three fixes is earned but seed-robust (≥ +$1.5M/sim-month against a healthy line pinned by `healthyOutFraction`). `bun run sim:report` prints every line above; tune only `constants.ts` until `tests/sim/economy.test.ts` passes. The `bleeds` switch lets the report show the clean baseline (`all false` → slope must be positive at login).

### 3.7 Event log and replay (`src/sim/events.ts`)

`createState(seed, config)` → genesis + prelude. `newLog(seed, wallMs)` → `[run.start]`. `appendAction(log, state, action, wallMs)` stamps `t = state.t`. `applyAction(state, action)`: `routing.set` upserts by id and re-sorts by `(priority, id)`; `routing.remove`; `fleet.policy` deep-merges, clamps `concurrency ≥ 0` and `maxAttempts` to 1..5; unknown fleet/rule → state unchanged. `advanceTo(state, t, config, rng)`. `replay(log, toT, config)`: `createState` → for each event in order `advanceTo(ev.t)` then apply → `advanceTo(toT)`. Actions apply at integer hour `state.t`, so live and replay see identical ordering. `hashState(state)` = fnv1a-32 over `t | cash.toFixed(4) | totals.tokens.toFixed(0) | per-fleet queue.toFixed(3)`; `appendCheckpoint(log, state)` every `CHECKPOINT_EVERY_HOURS`; `verifyCheckpoints(log, config)` → `{ ok, firstMismatchT }` (the console warns on mismatch and trusts replay). `export type PostMortemHook = (state: SimState) => void; // TODO(prestige)`.

### 3.8 Metrics and explore (`src/sim/metrics.ts`, `src/sim/explore.ts`)

- `slopePerWeek(state)`: net cash flow over the last `min(168, available)` hours scaled to 168 h. **This is the score.**
- `runwayMonths(state)`: `cash / (−slope × HOURS_PER_MONTH/168)`; `null` when slope ≥ 0 (rooms show "climbing"). `runwayWeeks(state)` likewise.
- `projectedZero(state): ProjectedZero | null` with `export interface ProjectedZero { weeksFromNow: number; atT: number }` — the linear projection of the trailing-week slope to cash 0.
- `weeksBought(runwayBeforeWk, runwayAfterWk, hoursAdvanced): WeeksBought` with `export type WeeksBought = { kind: 'delta'; weeks: number } | { kind: 'climbing' } | { kind: 'nowFinite'; runwayWeeks: number }`: both finite → `delta` with `weeks = runwayAfter − max(0, runwayBefore − hours/168)` (positive only when the slope improved; negative when it got worse; ≈ 0 when nothing changed); `runwayAfter === null` → `climbing`; `runwayBefore === null` and `runwayAfter` finite → `nowFinite` (the run was climbing and is not any more — a distinct sentinel, never reported as `climbing`). The honest "that bought four days" number.
- `headline(state)`: four signals — runway (mo), net/week ($), tokens/day, error rate (attempt-weighted %, `Σ attempts > 0 ? Σ attempts·p / Σ attempts : 0` over the trailing 24 h) — each with a 28-day daily history.
- `openIncidents(state): Incident[]`: derived, never stored. `retry-storm` (fleet `attemptsPerJob > 1.5 && errorRate > 0.3`), `backlog` (queue > `SLA_BACKLOG_HOURS` × arrivals). `export interface Incident { id: string; kind: 'retry-storm'|'backlog'; fleetId: string; since: number; costPerDay: number; summary: string }` — `since` is a **sim-hour** `t` (first hour the condition held, scanned from `hourly`; the oldest hour in the ring when it held throughout, which is the case for the storm at login); the console formats it with `clockLabel`. `costPerDay` = excess attempts re-priced.
- `fleetSummaries`, `fleetDetail`, `routingTable` (rules with workloads covered, tokens/day, cost/day; plus the 3×3 size-class × tier grid with `costPerDay`, `jobsPerDay`, `repricedPerDay: Record<Tier, number>` — last 7 days' tokens re-priced at each tier, the reading behind the "if routed here" column — and `belowFloor: Record<Tier, number>`, the count of the cell's workloads whose `minTier` ranks above that tier; plus a flat `workloads` list so the add-rule form can compute the same two readings for any match). Every fleet summary carries `serves: { id; name; arrPerMonth }[]` (the customers whose `servedBy` includes it) so the price of a pause is a fact on the row.
- `explore(state, q: ExploreQuery): ExploreResult` with
  `export interface ExploreQuery { range: '24h'|'7d'|'28d'|'run'; groupBy: 'fleet'|'model'|'workload'|'customer'; top?: number; fleetId?: string }`,
  `export type ExploreLink = { kind: 'fleet'; id: string } | { kind: 'workload'; id: string; fleetId: string } | { kind: 'tier'; id: Tier } | { kind: 'customer'; id: string }`,
  `export interface ExploreSeries { key: string; label: string; values: number[]; total: number; tokens: number; link: ExploreLink | null }`,
  `export interface ExploreResult { bucketHours: 1|24; bucketT: number[]; series: ExploreSeries[]; total: number; tokens: number }`.
  Cost = token + capacity; `tokens` = tokens over the range (so an idle fleet reads as `$53k/day · 0 tokens`). 24h/7d from `hourly`, 28d/run from `daily`. `fleetId` filters to that fleet's workloads **before** grouping, for every `groupBy` (so a model or customer breakdown of one fleet is a real selector, not a local approximation); totals reconcile within the filter. Capacity is attributed to the fleet, then through workload job shares (a fleet with no jobs puts its capacity on its first workload so idle fleets still show). Customer attribution = Σ workload cost × `customerShares`. `top` (default 10) keeps the largest and folds the rest into `other` (`link: null`). Totals agree across group-bys to 1e-6 relative. **`src/sim` never emits hash routes:** `link` is a typed target and the console builds the href with `href()` (T8).

---

## 4. Console architecture (`src/console/`)

### 4.1 File layout

```
src/sim/
  types.ts rng.ts time.ts                                         T1  contract
  names.ts physics.ts world.ts                                    T2  generator + the co-founder's voice; physics.ts = jobHoursFor / attemptsMultiplier / sizeClassOf (single definitions, step.ts imports them)
  constants.ts step.ts events.ts metrics.ts explore.ts index.ts report.ts   T3
src/console/
  index.html                       T5  system fonts only; #app; <link> /console.css; /console.js
  main.ts                          T9  mount(App)
  App.svelte                       T9  shell composition + global keys + boot
  router.ts                        T5  pure: Route, ROOMS, parseRoute, href
  router.svelte.ts                 T5  rune wrapper: current, navigate, start/stop
  format.ts                        T5  money/tokens/pct/clock formatting (pure)
  persistence.ts                   T5  localStorage log + stamp (pure over an injected Storage)
  core/run.ts                      T5  RunController — all game logic, plain TS, testable
  stores/game.svelte.ts            T5  rune wrapper over RunController + the 1 s clock driver
  stores/palette.svelte.ts         T9  ⌘K state (items from game + router)
  palette/fuzzy.ts                 T6  pure fuzzy match + rank
  theme.css                        T6  tokens + primitives
  palette.ts                       T6  JS mirror of the tokens; seriesStyle(i); WCAG helpers
  components/                      T6  Rail StatusPill Stat Panel DataTable TimeSeries TierBadge Note BarList
  components/TopBar.svelte         T9  runway · slope · clock · time controls · bought-weeks badge
  components/Palette.svelte        T9  ⌘K modal
  rooms/Overview.svelte Fleets.svelte FleetDetail.svelte           T7
  rooms/Routing.svelte Spend.svelte                                T8
src/client/**                      untouched; served at /cockpit/
tests/sim/*.test.ts   tests/console/*.test.ts   tests/build.test.ts
docs/E-Development/001-first-slice.md                            T9  runbook
```

Reused from the cockpit, cheaply: `src/client/components/Sparkline.svelte` (currentColor stroke) inside `Stat`; `springReveal` (panel mount) and `animateSpring` (number roll) from `src/client/motion/spring`. Nothing under `src/client/` is edited. `src/client/stores/speed.svelte.ts` is *not* reused: its semantics (animation pacing) differ from the sim clock.

### 4.2 Store contract

`core/run.ts` — plain TypeScript, no runes, fully unit-tested:

```ts
export interface TimeRecord { t: number; stampMs: number; paused: boolean; speed: SimSpeed; carryMs: number }
export interface AdvanceReport {                              // every advance, manual or tick-driven
  hours: number; cashDelta: number;
  slopeBefore: number; slopeAfter: number;
  runwayBefore: number | null; runwayAfter: number | null;   // weeks; null = climbing
}
export interface Payoff {                                     // the badge's source; only ever set after an action
  atT: number; actionT: number; hoursSinceAction: number;
  bought: WeeksBought;                                        // metrics.weeksBought(runwayAtAction, runwayNow, hoursSinceAction)
}
export const PAYOFF_MIN_HOURS = 24;
export interface RunDeps { storage?: Storage | null; now?: () => number; config?: SimConfig }
export class RunController {
  state: SimState; log: SimEvent[]; seed: number; config: SimConfig; rng: Rng; time: TimeRecord;
  lastAdvance: AdvanceReport | null; awaySummary: { hours: number; cashDelta: number } | null;
  payoff: Payoff | null;                       // see dispatch/advance below
  pendingAction: { t: number; runwayWeeks: number | null } | null;   // set by the first dispatch after the last payoff
  isFirstLogin: boolean;                       // true when boot() created the run (intro hook reads this)
  constructor(deps?: RunDeps);
  boot(nowMs?: number): void;                  // load → (version ok ? replay + verifyCheckpoints + catch-up : newRun) → save
  newRun(seed?: number): void;                 // seed default (now >>> 0); TODO(prestige): carried artifacts
  advance(hours: number): AdvanceReport;       // step; checkpoints; lastAdvance; scheduleSave; then, iff pendingAction and
                                               // state.t − pendingAction.t ≥ PAYOFF_MIN_HOURS: payoff = weeksBought(pendingAction.runwayWeeks,
                                               // runwayWeeks(), state.t − pendingAction.t), pendingAction = null. No action pending → payoff untouched.
  tick(nowMs?: number): number;                // wall-clock catch-up via hoursDue → advance(); returns hours advanced
  dispatch(action: Action): void;              // appendAction + applyAction + save; pendingAction ??= { t: state.t, runwayWeeks: runwayWeeks() }. The only write path.
  pause(): void; resume(): void; setSpeed(s: SimSpeed): void;
  saveNow(): void; scheduleSave(): void;       // 250 ms debounce; timers guarded for non-DOM
  onChange(cb: (run: RunController) => void): () => void;
  // selectors (memoised on state identity)
  runwayMonths(): number | null; runwayWeeks(): number | null; slope(): number; headline(): HeadlineSignal[];
  incidents(): Incident[]; fleets(): FleetSummary[]; fleet(id: string): FleetDetail | null;
  routing(): RoutingTable; explore(q: ExploreQuery): ExploreResult; projectedZero(): ProjectedZero | null;
  paletteFleets(): { id: string; name: string; role: string }[];
}
```

`stores/game.svelte.ts` — thin rune wrapper, singleton `export const game`:

```ts
class GameStore {
  state = $state.raw<SimState>(...);            // whole-object replacement on every change
  lastAdvance = $state<AdvanceReport | null>(null);
  payoff = $state<Payoff | null>(null);
  awaySummary = $state<{ hours: number; cashDelta: number } | null>(null);
  paused = $state(false); speed = $state<SimSpeed>(1); isBankrupt = $derived(...);
  readonly run: RunController;                  // constructed with real localStorage
  boot(): void; startClock(): void; stopClock(): void;   // 1 s setInterval → run.tick()
  dispatch(action: Action): void; advanceDays(n: number): void; advanceWeeks(n: number): void;
  pause(): void; resume(): void; setSpeed(s: SimSpeed): void; newRun(seed?: number): void;
  // derived views, re-evaluated when `state` identity changes
  get runway(); get runwayWeeks(); get slope(); get headline(); get incidents(); get fleets(); get routing(); get clock();
  fleet(id: string); explore(q: ExploreQuery); projectedZero();
}
```

Rooms read `game.*` inside `$derived` and write only via `game.dispatch`. Nothing mutates `game.state`; `$state.raw` makes accidental mutation non-reactive, which is the guard, and the `replay == live` test in T5 is the proof.

### 4.3 Routing between rooms

Hash routes, no server involvement. `router.ts` (pure): `type Room = 'overview'|'fleets'|'fleet'|'routing'|'spend'`; `interface Route { room: Room; id?: string; query: Record<string, string> }`; `parseRoute(hash)`; `href(route)`; `ROOMS: { room; label; hotkey }[]` (overview `g o`, fleets `g f`, routing `g r`, spend `g s`). Routes: `#/overview` (default), `#/fleets`, `#/fleets/:id`, `#/routing?tier=`, `#/spend?group=fleet|model|workload|customer&range=24h|7d|28d|run&top=&fleet=` (defaults `fleet` / `7d` / `10` / none; `fleet=<id>` is the explore `fleetId` filter and round-trips like every other key). Spend rows link by `series.link.kind`: `fleet`/`workload` → `#/fleets/:id`, `tier` → `#/routing?tier=…`, `customer` → no door in this slice (Customers room is a hook, §8): the discovery room points at the lever. `src/sim` never emits routes; `href()` is the only place a hash is built. Overview's incident rows link to the fleet; its tokens tile links to `#/spend?group=model`; a "where the money goes" door links to `#/spend?group=fleet`.

### 4.4 Rooms, one decision each

| Room | Shows | Lever | Doors out |
|---|---|---|---|
| **Overview** | Runway and slope tiles; the **cash curve** (28 days of history plus a dashed 28-day projection at the current slope, with the text "cash reaches zero ≈ wk N" or "climbing"); four headline signals with 28-day sparklines; open incidents | none | incident → Fleet detail; tokens → Spend ▸ model; "where the money goes" → Spend ▸ fleet |
| **Fleets** | Sortable table: name (mono), role, status pill, tier mix, cost/day, tokens/day, error %, attempts/job, utilization, queue, slots, 7-day cost sparkline; header totals | pause/resume; scale-to-zero toggle | row → Fleet detail |
| **Fleet detail** | header + co-founder notes; workloads table (size class, tier + the rule that chose it, avg tok/job, jobs/h, cost/day, error %, eval floor); 7-day token curve by tier; error-budget meter; the fleet's incidents | **routing policy** (inherit rules / small / medium / frontier — fleet-scoped rule at priority 10) and **concurrency**; plus the retry policy section (max attempts, backoff, circuit breaker) with a `TODO(incidents)` and the plain definition of each term | Spend ▸ workload filtered to the fleet; Routing |
| **Models & Routing** | rules table (priority, match, tier, note, author, workloads covered, tokens/day, cost/day); add-rule form; the **effective-routing grid** (size class × tier: cost/day, jobs/day, and "last 7d re-priced at S / M / F"); the three models' prices | add / edit / remove routing rules — the biggest lever | rule → the fleets it covers |
| **Spend Explorer** | range, group-by, top-N, optional fleet filter (chip with a clear link); stacked TimeSeries; totals BarList with share %, direct labels and a tokens hint per row; range total | none | fleet/workload row → Fleet detail; model row → Routing (tier highlighted); customer row → no door (Customers room, §8) |

**The payoff beat.** The badge is the answer to an action, so it appears only from `game.payoff`, which `RunController` sets once the run has advanced ≥ `PAYOFF_MIN_HOURS` past the first dispatch since the last badge (§4.2) — a manual `+1 day`/`+1 week`, or the wall clock catching up at any speed. Advances with no action pending never touch it, so at 1008× nothing flashes every second. Five states, each glyph + text, 6 s then fades: `delta ≥ 0.1` → accent purple `▲ +3.1 wk bought`; `|delta| < 0.1` → muted grey `no change`; `delta ≤ −0.1` → muted grey `▼ −0.5 wk`; `climbing` → accent `▲ climbing`; `nowFinite` → muted grey `runway now finite · 26 wk`. The baseline is the runway at the moment of the action, so the number attributes to the player only what changed since they acted. The runway tile rolls via `animateSpring`. Before acting, the Routing grid and the Fleet detail policy select show the counterfactual re-pricing as a fact: "last 7d at small: $4.5k/day". No projection is a recommendation; every one is a reading of recorded tokens at a listed price.

**First login.** `Overview` at `t = PRELUDE_HOURS` with 28 days of history, runway ≈ 6.2 mo, slope ≈ −$5.6M/wk, `retry-storm · halberd-monitor` open. `run.isFirstLogin` is where the intro sequence will gate (`TODO(intro)` in `App.svelte`).

### 4.5 ⌘K palette and time controls

`palette/fuzzy.ts` (pure): `fuzzyScore(query, text): number` — case-insensitive subsequence; 0 when not a subsequence; bonuses for prefix and contiguous runs; ties broken by shorter text. `rank(query, items, limit)`. `stores/palette.svelte.ts`: `open`, `query`, `selected`, `items = $derived(ROOMS + game.run.paletteFleets())`, `matches`, `toggle/close/move/commit`. `App.svelte` binds ⌘K / Ctrl+K, Esc, arrows, Enter; `g o|f|r|s` chords (500 ms) when the palette is closed. Chords and Space are ignored when `event.target` is an `input`, `select`, `textarea` or `[contenteditable]`, or when `event.isComposing` — typing "go small" into a rule note never navigates.

`TopBar.svelte`: runway (money hue, mono) · slope/wk with ▲/▼ glyph · sim clock `wk 3 · d 2 · 14:00` · controls `▶/⏸` (glyph + text), speed `<select>` labelled by meaning (`1 wk / day`, `1 wk / hour`, `1 wk / 8.6 min`, `1 wk / 86 s`), `+1 day`, `+1 week` · bought-weeks badge · one-time "while you were away: N sim-days, −$X" line from `awaySummary` · on bankruptcy a `bankrupt · wk N` pill and a `new run` button (`TODO(prestige)`).

### 4.6 Persistence

`persistence.ts`: `SAVE_KEY = 'spaghetti.console.run.v1'`; `SaveRecord = { version, seed, log: SimEvent[], time: TimeRecord }`; `load(storage)`, `save(rec, storage)`, `clear(storage)`, `safeStorage()`; every access in try/catch; malformed JSON → `null`. Only the log is stored; state is regenerated by replay (prelude + ≤ 52 weeks ≈ 9.4k ticks, well under a second). Saves are debounced 250 ms and flushed on `visibilitychange`/`pagehide`. On load: replay → verify checkpoints (warn, trust replay) → `hoursDue` catch-up unless paused → `awaySummary`.

### 4.7 Build and serve

- `src/build.ts`: `buildClient(outdir = 'dist/client')` unchanged except the html goes to `${outdir}/cockpit/index.html` (its `/main.js` reference still resolves at root). `buildConsole(outdir = 'dist/client', entry = 'src/console/main.ts', html = 'src/console/index.html')` with `naming: { entry: 'console.[ext]', chunk: '[name]-[hash].[ext]', asset: '[name]-[hash].[ext]' }` → `console.js` + `console.css` + root `index.html`. Bun does not inline a `.css` import into the JS bundle: it emits the CSS reachable from the entry as a sibling output that takes the `entry` naming (`console.css`; verified on Bun 1.3.14 with the existing Svelte plugin). The console's `index.html` therefore links `/console.css` explicitly (T5); no inline fallback exists or is needed. **If the entry is missing, `buildConsole` logs `[build] console entry missing, skipping` and returns** so `bun run dev` works in every wave. `buildAll()` runs cockpit then console; `import.meta.main` → `buildAll`.
- `src/server/index.ts`: when the resolved path does not exist or has no extension, try `${path}/index.html` before the SPA fallback (so `/cockpit` and `/cockpit/` work); `/api/*` untouched; SPA fallback is the console.
- `src/server/dev.ts`: `buildAll`, watch `src/client`, `src/console`, `src/sim` with the existing debounce; log `[dev] watching src/client, src/console, src/sim`.
- `package.json`: add `"sim:report": "bun run src/sim/report.ts"`, `"typecheck": "tsc --noEmit"`. No new dependencies (d3-shape covers `stack`/`area`/`line`).

---

## 5. Visual system

### 5.1 Tokens (`theme.css` on `:root`, mirrored in `palette.ts`)

```
--bg-0 #0D0D12   --bg-1 #111118   --bg-2 #141420   --bg-3 #1B1B2A   --line #262636
--fg #E8E6F0     --fg-muted #9A98A8
--accent #9B6DFF --accent-soft rgba(155,109,255,.18)   --electric #B8F0FF
--money #F0E442                       Okabe–Ito yellow. Cash, runway, spend totals, $ columns. Always with a "$". Never a series, never a status.
--good #A6D8FF   --warn #FFB454   --bad #FF6FA3        pale blue / pale amber / pale magenta-red + glyph ● ▲ ✕ + text label. Never green/amber/red.
                                      Tints, not the Okabe–Ito hexes: no status hex equals any --cat-N, and status reads lighter than every series (a second cue beside the glyph).
--cat-1 #0072B2  --cat-2 #E69F00  --cat-3 #56B4E9  --cat-4 #009E73  --cat-5 #D55E00  --cat-6 #CC79A7  --cat-7 #999999
                                      Okabe–Ito minus yellow (money owns it). Fills, strokes and swatches only — never text, never status.
--tier-small var(--cat-3)  --tier-medium var(--cat-1)  --tier-frontier var(--cat-5)   always with the S / M / F letter and name; aliases of series hues only, never of status hues
--font-ui   ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif
--font-data ui-monospace, "SF Mono", Menlo, "JetBrains Mono", Consolas, monospace
--radius 10px  --gap 12px
```

Rules: UI text in `--font-ui`; every number, id, fleet name and table cell in `--font-data` with `tabular-nums`. Italic only for the co-founder's notes. Status is always glyph + label + color (`StatusPill`). Chart series always carry a legend marker glyph; series index ≥ 3 also carry a dash pattern; money series are solid `--money`. Status hues are never used as chart series and category hues are never used for status. Reduced motion respected everywhere.

### 5.2 Proof (computed 2026-09-15; `tests/console/palette.test.ts` re-checks the contrast rows)

WCAG contrast against `--bg-1` / `--bg-2`:

| token | hex | vs bg-1 | vs bg-2 | verdict |
|---|---|---|---|---|
| fg | #E8E6F0 | 15.2 | 14.8 | text ✓ |
| fg-muted | #9A98A8 | 6.7 | 6.5 | text ✓ |
| accent | #9B6DFF | 5.4 | 5.2 | text ✓ |
| money | #F0E442 | 14.2 | 13.8 | text ✓ |
| good | #A6D8FF | 12.4 | 12.1 | text ✓ |
| warn | #FFB454 | 10.7 | 10.3 | text ✓ |
| bad | #FF6FA3 | 7.2 | 7.0 | text ✓ |
| cat-1 | #0072B2 | 3.6 | 3.5 | fills only (≥ 3:1 non-text) |
| cat-4 | #009E73 | 5.5 | 5.3 | fills only by rule |
| cat-5 | #D55E00 | 4.9 | 4.7 | fills only by rule |
| electric | #B8F0FF | 15.2 | 14.7 | ✓ |

CIELAB ΔE between pairs, normal / simulated deuteranopia / protanopia (Machado 2009, severity 1):

| pair | normal | deut | prot | consequence |
|---|---|---|---|---|
| good / warn | 86 | 85 | 81 | the maker's blind pair is the safest pair in the set |
| warn / bad | 73 | 54 | 71 | ✓ |
| good / bad | 73 | 35 | 28 | distinguishable; glyphs ● / ✕ carry it anyway |
| money / warn | 37 | 16 | 29 | separated mostly by lightness (14:1 vs 11:1); never adjacent as the same kind of element; warn always ▲ + label; money always "$" |
| cat-2 / cat-4 (amber / green) | 89 | 66 | 61 | ✓ |
| good / cat-3 (its series cousin) | 19 | 19 | 16 | different hexes, same hue family; a status pill never sits in a chart and a series never carries a pill, and the tint is ≈ 1.5× the series' contrast |
| warn / cat-2 | 18 | 16 | 24 | as above |
| bad / cat-6 | 24 | 15 | **5** | near-identical under protanopia → the rule that status hues never appear as series and series never as status; series carry glyph + legend |

(Method: sRGB → linear → Machado 2009 severity-1 matrix → XYZ D65 → CIELAB, ΔE76; the same script reproduces the pre-revision rows for the old hexes exactly.)

Under grayscale every state and every series remains readable by its glyph, label or dash. That is the test a reviewer runs by hand (`filter: grayscale(1)` on `html`).

---

## 6. Tests

All under `bun test`, `describe/test/expect` from `bun:test` as in `tests/motion.test.ts`. Tests import only plain `.ts` modules (never `.svelte` or `.svelte.ts`).

| file | task | asserts |
|---|---|---|
| `tests/sim/rng.test.ts` | T1 | same seed → same sequence; `forHour(12)` independent of whether `forHour(11)` ran; uniform in [0,1); lognormal mean ≈ 1 |
| `tests/sim/time.test.ts` | T1 | `hoursDue(0, 86_400_000, 1, 0)` = `{168, 0}`; carry of remainders; cap at `MAX_CATCHUP_HOURS`; `simClock` labels incl. negative weeks |
| `tests/sim/world.test.ts` | T2 | 40 fleets, unique ids; `summarizer-east` = `bleeds.tiering`, `halberd-monitor` = `bleeds.retryStorm`, 6 idle rivers; canonical notes verbatim; customerShares sum to 1; every fleet in ≥ 1 `servedBy`; pinned home segments; every trivial template has `minTier: 'small'`; healthy out-fraction ≈ `healthyOutFraction` ± 0.02; ARR sums; same seed → deep-equal; different seed → different idle set; notes never address the player |
| `tests/sim/determinism.test.ts` | T3 | same seed, 4 weeks → `toEqual`; `step(s,168) ≡ 168 × step(s,1)`; input not mutated (deep-frozen) |
| `tests/sim/replay.test.ts` | T3 | seeded action script over 8 weeks live vs `replay(log)` → `toEqual`; checkpoint hashes equal |
| `tests/sim/economy.test.ts` | T3 | untouched: `(bankruptAt − PRELUDE_HOURS)/168 ∈ [23, 30]` for seeds 1..10; opening slope ∈ [−6.5M, −5.0M]/wk (the same contract in two units); fix (a) at login → after 2 wk `\|slope\| < 0.6 × \|slope₀\|`; fix all three at login → `slope > 0` after 4 wk and `cash(wk 8) > cash(wk 4)`; fix all three at week 16 → never bankrupt through week 52; pause ordering after 2 wk: pause `summarizer-east` alone → slope worse than fix (a); pause `halberd-monitor` alone → slope worse than fix (b); pause both → slope worse than fix (a)+(b); pause every fleet → slope still < 0; `bleeds: all false` → slope > 0 at login |
| `tests/sim/invariants.test.ts` | T3 | 200 seeded random actions (incl. `status: 'paused'` and `concurrency: 0`) over 26 weeks: no NaN/Infinity anywhere in state, `headline`, `fleetSummaries` or `explore`; tokens, costs, queues, slots ≥ 0; errorRate ∈ [0, MAX]; `queue' ≤ a + queue` per fleet-hour; `hourly.length ≤ HOURLY_WINDOW`; `daily.length === floor(t/24)`; explicit cases: one fleet paused for 2 wk → its errorRate, attemptsPerJob and error budget are 0, not NaN; every fleet paused for 2 wk → headline error rate 0, no NaN |
| `tests/sim/literals.test.ts` | T3 | reads `src/sim/step.ts`, strips comments and string literals, extracts every numeric literal (a digit run with optional fraction and exponent that is not preceded by an identifier character or a dot, so `hash32` and `fnv1a` do not match), asserts every match ∈ {0, 1, 2, 24, 100, 1e6, 3600} |
| `tests/sim/explore.test.ts` | T3 | totals agree across group-bys and equal the ledger; `top` folds into `other` (`link: null`); bucket counts per range; idle fleets present with ≈ 0 `tokens` and non-zero cost at login; `fleetId` filter: every group-by of one fleet totals that fleet's cost, and `groupBy: 'model'` with `fleetId: 'summarizer-east'` is 100% frontier at login |
| `tests/sim/metrics.test.ts` | T3 | runway null when slope ≥ 0; `retry-storm` open at login (`since` ≤ `PRELUDE_HOURS − 600`) and closed within 24 h of enabling the breaker; four headline signals with 28-point histories at login; `weeksBought` → `delta` (positive, ≈ 0, negative), `climbing`, `nowFinite`; `projectedZero`; `routingTable().grid.trivial.frontier.belowFloor.small === 0` at login; `fleetSummaries` → `summarizer-east.serves` includes `smb` |
| `tests/build.test.ts` | T4 | builds the cockpit and a throwaway console entry (which imports a throwaway `.css`) into a tmp dir; asserts `console.js` and `console.css` exist; missing entry → skip log, no throw |
| `tests/console/router.test.ts` | T5 | `parseRoute` / `href` round-trip every route incl. `#/spend?group=model&range=7d&top=10&fleet=summarizer-east`; defaults |
| `tests/console/format.test.ts` | T5 | `money`, `moneyPerWeek`, `tokens`, `pct`, `clockLabel`, U+2212 minus |
| `tests/console/persistence.test.ts` | T5 | round-trip through a `MemStorage`; corrupt JSON → null; version mismatch → null |
| `tests/console/run.test.ts` | T5 | `newRun(1)` → `advance(168)` → `dispatch(fixA)` → `replay(log)` deep-equals `state`; `boot()` with a 24 h-old stamp at speed 1 advances 168 and sets `awaySummary`; paused record does not advance; payoff: `tick`-driven advances with no dispatch leave `payoff` null; `dispatch(fixA)` + `advance(168)` → `payoff.bought = { kind: 'delta', weeks ≥ 2 }`; a further `advance(168)` with no dispatch leaves `payoff` unchanged; all three fixes + 4 wk → `climbing`; then `routing.remove` the trivial rule + 1 wk → `nowFinite`; `dispatch` + `advance(1)` → still no payoff (`< PAYOFF_MIN_HOURS`) |
| `tests/console/palette.test.ts` | T6 | WCAG contrast rows of §5.2; `SERIES` has no `--money` hex; `SERIES ∩ {good, warn, bad} = ∅`; `Object.values(TIER_COLOR) ∩ {good, warn, bad} = ∅`; `fuzzyScore` ranking (`'hal'` → `halberd-monitor` first; non-subsequence → 0; prefix beats scattered) |
| `tests/console/smoke.test.ts` | T9 | `buildConsole` of the real entry succeeds in-process; `console.js` > 10 KB; `console.css` exists and contains `--accent`; no `fonts.googleapis`; zero `[svelte]` warnings captured |
| `tests/console/walkthrough.test.ts` | T9 | the §1 walk, headless on `RunController` + `MemStorage`: at login `incidents` contains `retry-storm`/`halberd-monitor`; `explore(model)` frontier share ≥ 0.55; `explore(fleet)` top = `summarizer-east` share ≥ 0.30; `fleet('summarizer-east')` workloads all trivial on frontier via `cf-summarizer-east`; grid `trivial.frontier.repricedPerDay.small` ≤ 0.05 × `costPerDay`; dispatch `trivial → small`; `advance(168)` → `\|slope\|` ≤ 0.6 × before and `payoff.bought` is `{ kind: 'delta', weeks ≥ 2 }`; then fix (b) + (c), advance 4 weeks → `runwayWeeks === null`, `projectedZero() === null` and `payoff.bought.kind === 'climbing'` |

---

## 7. Tasks

Nine tasks. File ownership is disjoint; no two tasks touch the same file. Waves: **W1** T1 · T4 → **W2** T2 · T6 → **W3** T3 → **W4** T5 → **W5** T7 · T8 → **W6** T9.

### T1 — Sim contract: types, seeded RNG, sim time

**Owns:** `src/sim/types.ts`, `src/sim/rng.ts`, `src/sim/time.ts`, `tests/sim/rng.test.ts`, `tests/sim/time.test.ts`. **Depends on:** none.

**Spec.** `types.ts` exports exactly §3.2 plus `export interface Constants` with numeric fields `OPENING_CASH, ARR_TOTAL, FIXED_OPEX_PER_MONTH, SLOT_HOUR_PRICE, HOURS_PER_WEEK, HOURS_PER_MONTH, HOURS_PER_YEAR, HOURLY_WINDOW, PREFILL_TPS, JOB_OVERHEAD_S, SIZE_CLASS_TRIVIAL_MAX, SIZE_CLASS_STANDARD_MAX, UNDER_TIER_ERROR_PENALTY, FAILED_OUTPUT_FRACTION, MAX_ERROR_RATE, STORM_GAIN, STORM_EXCESS_CAP, NATURAL_RECOVERY_PER_HOUR, BREAKER_TRIP, BREAKER_RESET, BREAKER_RECOVERY_PER_HOUR, BACKOFF_RECOVERY_PER_HOUR, SCALE_TO_ZERO_MIN_SLOTS, AUTOSCALE_HEADROOM, DIURNAL_AMPLITUDE, DIURNAL_PEAK_HOUR, DAYS_PER_WEEK, WEEKEND_START_DAY, WEEKEND_FACTOR, JITTER_SIGMA, SLA_BACKLOG_HOURS, ERROR_BUDGET_SLO_MISS, CHECKPOINT_EVERY_HOURS, SIM_VERSION` and `TIERS: Record<Tier, ModelDef>`, `world: WorldParams`. `export interface WorldParams { fleetCount: number; idleFleetCount: number; idleSlotsPerFleet: number; idleJobsPerHour: number; bleeds: { tiering: boolean; retryStorm: boolean; idle: boolean }; bleedA: { jobsPerHour: number; inTok: number; outTok: number; split: number[] }; bleedB: { jobsPerHour: number; inTok: number; outTok: number; maxAttempts: number; stormExcess0: number; stormPeakP: number; slotHeadroom: number }; healthyTokensPerMonth: number; healthyTierMix: Record<Tier, number>; healthyOutFraction: number; healthySlotsTotal: number; provisionHeadroom: number; arrTotal: number; namedAccounts: { name: string; arr: number; servedByFamily: FleetFamily }[]; segments: { id: string; name: string; accounts: number; arrShare: number }[]; homeSegments: Record<string, string[]> }` and `export interface WorldPhysics` per §3.2 (`prefillTps, overheadS, diurnalAmplitude, hoursPerMonth, trivialMax, standardMax`) — the six numbers the generator and `step.ts` must agree on, so they are passed, never re-typed.
`rng.ts`: `hash32(...ints: number[]): number` (murmur3 finaliser over the sequence), `fnv1a(s: string): number`, `HourRng`, `Rng`, `createRng(seed)` per §3.3.
`time.ts`: `PRELUDE_HOURS = 672`, `SIM_HOURS_PER_REAL_MS`, `MAX_CATCHUP_HOURS = 8760`, `type SimSpeed = 1 | 24 | 168 | 1008`, `hoursDue(stampMs, nowMs, speed, carryMs = 0): { hours: number; carryMs: number }` (floor, carry, clamp, never negative), `sinceLogin(t)`, `simClock(hoursSinceLogin): { week; day; hour; label }` (`wk 3 · d 2 · 14:00`, 1-based, negatives allowed), `weeksOf(hours)`.

**Acceptance.**
- `bun test tests/sim/rng.test.ts tests/sim/time.test.ts` passes.
- `createRng(7).forHour(12).next()` is identical across fresh instances and independent of prior `forHour` calls.
- `hoursDue(0, 86_400_000, 1, 0)` → `{ hours: 168, carryMs: 0 }`; `hoursDue(0, 1000, 1, 0)` → `{ hours: 0, carryMs: 1000 }`; hours never exceed `MAX_CATCHUP_HOURS`.
- `bunx tsc --noEmit -p tsconfig.json` reports no errors in `src/sim/types.ts`; `grep -rE "document|window|localStorage|node:fs" src/sim` is empty.

### T2 — World generator with the co-founder's names and notes

**Owns:** `src/sim/names.ts`, `src/sim/physics.ts`, `src/sim/world.ts`, `tests/sim/world.test.ts`. **Depends on:** T1.

**Spec.** `names.ts`: `FLEET_NAME_FAMILIES: Record<FleetFamily, readonly string[]>` — ingest = rivers (danube, volga, tigris, mekong, orinoco, yukon, rhone, indus, zambezi, ob, lena, severn, tagus, murray); summarizer = `summarizer-east`, `summarizer-west` fixed then winds (mistral, sirocco, chinook, zephyr, bora, foehn, harmattan, pampero); monitor = `halberd-monitor` fixed then lighthouses (fastnet, eddystone, skerryvore, bishop-rock, longships, wolf-rock, bell-rock, portland); relay = `comms-relay`, `secondary-runner` fixed then birds (heron, kestrel, plover, curlew, sandpiper, gannet, tern, shrike); ledger = mountains (aran, cuillin, torridon, snowdon, helvellyn, cadair, pentland, cheviot). `ROLE_BY_FAMILY`, `WORKLOAD_TEMPLATES: Record<FleetFamily, readonly { name; inTokMean; outTokMean; minTier: Tier; businessHours: boolean; share: number }[]>` (≥ 3 per family spanning trivial/standard/heavy; **every template with `inTokMean + outTokMean ≤ trivialMax` has `minTier: 'small'`**, so the global `trivial → small` lever can never under-tier by construction — heavy templates keep honest `minTier` values and remain the trap; templates are authored at ≈ 80/20 in/out so the healthy out-fraction target is reachable), `NOTES: { general; tiering; retryStorm; idle; byFamily }` of `CoFounderNote[]` in the co-founder's voice (dated `MM-DD`, dry, private, never addressing the player, no emoji; the last idle note trails off). Canonical lines verbatim: tiering → "summarizer-east is on the big model because I never got around to the eval. Don't let it stay that way."; retryStorm → "If halberd-monitor pages twice in an hour it's the retry loop again. Circuit-break it and go back to bed."; ingest → "Renamed the ingest fleets after rivers. Sorry. It was late."
`physics.ts` (pure, no imports beyond `types`): `jobHoursFor(inTok, outTok, model, prefillTps, overheadS)`, `attemptsMultiplier(p, maxAttempts)` (§3.4 step 6 incl. the p = 0 and p ≥ 1 cases), `sizeClassOf(totalTokens, trivialMax, standardMax)`, `peakDemandFactor(diurnalAmplitude) = 1 + diurnalAmplitude`. These are the single definitions; `step.ts` (T3) imports them and defines none of its own.
`world.ts`: `generateWorld(seed, params: WorldParams, tiers: Record<Tier, ModelDef>, physics: WorldPhysics): WorldDef` — pure, uses `createRng(seed).fork('world')` only; every physical number it needs (`prefillTps`, `overheadS`, `diurnalAmplitude`, `hoursPerMonth`, `trivialMax`, `standardMax`) comes from `physics`, so a retune of `constants.ts` moves the generator and `step.ts` together and the capacity it provisions always matches the job-hours `step` will charge. (1) Allocate `fleetCount` across families; the idle set (if `params.bleeds.idle`) is a seed-shuffled subset of ingest rivers of size `idleFleetCount`, each with one trivial workload at `idleJobsPerHour`, `provisionedSlots = idleSlotsPerFleet`, `defaultTier: 'small'`, note from `NOTES.idle`. (2) `summarizer-east`: two trivial workloads from `bleedA` (`ticket-summary`, `ticket-triage`, jobs split by `bleedA.split`), `minTier: 'small'`; if `params.bleeds.tiering` then `defaultTier: 'frontier'` plus the rule `{ id: 'cf-summarizer-east', priority: 50, match: { fleetId: 'summarizer-east' }, tier: 'frontier', author: 'cofounder', note: 'eval pending' }` and the canonical note; else `defaultTier: 'small'`. (3) `halberd-monitor` (role `trading-ops · Halberd Capital`): one heavy workload `watch-positions` from `bleedB`, `minTier: 'frontier'`, `defaultTier: 'frontier'`; if `params.bleeds.retryStorm` then `initialStormExcess = bleedB.stormExcess0`, `initialPolicy.retry = { maxAttempts: bleedB.maxAttempts, backoff: 'none', circuitBreaker: false }` and the canonical note; provisioned with `bleedB.slotHeadroom` over the storm-load **at the cap**, `ceil(jobsPerHour × attemptsMultiplier(bleedB.stormPeakP, maxAttempts) × jobHours × peakDemandFactor × slotHeadroom)`, where `stormPeakP` (0.61 = base + `STORM_EXCESS_CAP`) is a `WorldParams` key so the generator never re-derives the storm dynamics; sizing for `stormExcess0` alone would under-provision once the storm pins. (4) Remaining fleets healthy: 2–4 workloads from templates, `jobsPerHour` scaled per template so Σ healthy tokens/month ≈ `healthyTokensPerMonth` with tier mix ≈ `healthyTierMix` **and** Σ out/(in+out) over healthy workloads ≈ `healthyOutFraction` (two constraints, scaled within each tier bucket; the healthy token line is a tuned number, not an emergent one); `defaultTier` = max `minTier` among the fleet's workloads, with a seed-chosen 5% bumped to frontier; `provisionedSlots = ceil(peakSlotsNeeded × provisionHeadroom)` using `peakDemandFactor(physics.diurnalAmplitude)` and `jobHoursFor` from `physics.ts`; scale so Σ healthy slots ≈ `healthySlotsTotal`. (5) `initialPolicy = { status: 'active', concurrency: provisionedSlots, scaleToZero: false, retry: { maxAttempts: 3, backoff: 'exponential', circuitBreaker: true } }` for all but halberd-monitor. (6) Customers: segments from `params.segments` (arr = arrShare × (arrTotal − Σ named)). **Every fleet has ≥ 1 home segment:** the pinned ones from `params.homeSegments` (`summarizer-east` → smb; `halberd-monitor` → enterprise and fintech), every other fleet one seed-spread home segment such that each segment has ≥ 5 fleets; `segment.servedBy` = the inverse map. Named accounts are served by the fleet named for them if any (Halberd → halberd-monitor) plus one fleet of `servedByFamily`. `customerShares` per workload distributes over customers whose `servedBy` includes the fleet, weighted by arr, summing to 1 (never an empty set, so the sum is always defined). (7) Every fleet gets 0–2 general/family notes; bleed fleets get their specific notes. Deterministic ordering everywhere (never iterate object keys unsorted; use `fleetOrder`/`customerOrder`). `world.bleeds` filled (null / empty when a bleed is off).
`tests/sim/world.test.ts` uses an inline `TEST_PARAMS` / `TEST_TIERS` / `TEST_PHYSICS` fixture (values from §3.6) so this task does not wait on `constants.ts`.

**Acceptance.**
- `bun test tests/sim/world.test.ts` passes.
- `generateWorld(1, P, T, PHYS).fleetOrder.length === 40`; ids and names unique; `bleeds.tiering === 'summarizer-east'`, `bleeds.retryStorm === 'halberd-monitor'`, `bleeds.idle.length === 6` and all six are ingest rivers.
- Every workload's `customerShares` sums to 1 ± 1e-9; Σ `customers.arr === arrTotal ± 1`; `Halberd Capital` is a named account served by `halberd-monitor`; every fleet id appears in at least one customer's `servedBy`; `smb.servedBy` includes `summarizer-east`; `enterprise.servedBy` and `fintech.servedBy` include `halberd-monitor`; every segment has ≥ 5 fleets.
- Every `WORKLOAD_TEMPLATES` entry with `inTokMean + outTokMean ≤ PHYS.trivialMax` has `minTier === 'small'`; over healthy workloads `Σ outTok·jobs / Σ (inTok + outTok)·jobs` is within ± 0.02 of `healthyOutFraction`; Σ healthy tokens/month within ± 5% of `healthyTokensPerMonth`.
- `provisionedSlots` of every healthy fleet equals `ceil(peak slots × provisionHeadroom)` recomputed in the test from `physics.ts` with `PHYS` — the generator uses no physics number of its own.
- Same seed → deep-equal world; seeds 1 and 2 → different `bleeds.idle`.
- ≥ 30 fleets have non-empty `notes`; no note contains "you", "operator", "player" or an emoji; the three canonical lines are present verbatim.
- With `bleeds` all false: no `cf-` rule, `summarizer-east.defaultTier === 'small'`, `halberd-monitor.initialStormExcess === 0`, `bleeds.idle` empty.

### T3 — Sim core: constants, step, events/replay, metrics, explore, report, economy tests

**Owns:** `src/sim/constants.ts`, `src/sim/step.ts`, `src/sim/events.ts`, `src/sim/metrics.ts`, `src/sim/explore.ts`, `src/sim/index.ts`, `src/sim/report.ts`, `tests/sim/determinism.test.ts`, `tests/sim/replay.test.ts`, `tests/sim/economy.test.ts`, `tests/sim/invariants.test.ts`, `tests/sim/literals.test.ts`, `tests/sim/explore.test.ts`, `tests/sim/metrics.test.ts`. **Depends on:** T1, T2.

**Spec.** `constants.ts`: `CONSTANTS: Constants` (§3.6 values incl. `TIERS` and `world: DEFAULT_WORLD_PARAMS`), `DEFAULT_WORLD_PARAMS`, `DEFAULT_CONFIG: SimConfig`; the P&L targets in a comment block. Tune here and only here.
`step.ts`: `step(state, dtHours, config, rng)`; `tickHour(state, config, hourRng)`; `resolveTier(routing, fleetId, w, fallback): { tier; ruleId: string | null }`; `demandFactor(t, businessHours, c)`; imports `jobHoursFor` and `attemptsMultiplier` from `physics.ts` (T2) and defines neither; implements §3.4 exactly (incl. the re-queue term, the 0/0 guards and the pre-tick bankruptcy `t`) and in deterministic order. **No numeric literals other than 0, 1, 2, 24, 100, 1e6, 3600** — every other number, including the diurnal peak hour, days per week and the weekend start day, is a `Constants` key; `tests/sim/literals.test.ts` enforces this mechanically (§6).
`events.ts`: `physicsOf(c: Constants): WorldPhysics` = `{ prefillTps: c.PREFILL_TPS, overheadS: c.JOB_OVERHEAD_S, diurnalAmplitude: c.DIURNAL_AMPLITUDE, hoursPerMonth: c.HOURS_PER_MONTH, trivialMax: c.SIZE_CLASS_TRIVIAL_MAX, standardMax: c.SIZE_CLASS_STANDARD_MAX }`; `createState(seed, config = DEFAULT_CONFIG)` (genesis from `generateWorld(seed, config.constants.world, config.constants.TIERS, physicsOf(config.constants))`, runtime from `initialPolicy`/`initialStormExcess` with `slotsNeeded: 0`, routing = `world.routing`, then the 672 prelude ticks, then — after the loop — `cash = OPENING_CASH` and the `cashClose` back-fill of both `hourly` and `daily` per §3.1); `applyAction`; `advanceTo`; `newLog(seed, wallMs)` (`run.start` at `t: PRELUDE_HOURS`); `appendAction`; `appendCheckpoint`; `replay(log, toT, config)`; `hashState`; `verifyCheckpoints`; `export type PostMortemHook // TODO(prestige)`.
`metrics.ts`: `slopePerWeek`, `runwayMonths`, `runwayWeeks`, `export interface ProjectedZero { weeksFromNow: number; atT: number }`, `projectedZero(state): ProjectedZero | null`, `export type WeeksBought` and `weeksBought(before, after, hours): WeeksBought` per §3.8, `HeadlineSignal { id: 'runway'|'net'|'tokens'|'errors'; label; unit; value: number | null; history: number[]; goodWhen: 'up'|'down' }`, `headline`, `export interface Incident { id: string; kind: 'retry-storm'|'backlog'; fleetId: string; since: number /* sim-hour t */; costPerDay: number; summary: string }`, `openIncidents`, `FleetSummary { id; name; family; role; status; tierMix: Record<Tier, number>; costPerDay; tokensPerDay; errorRate; attemptsPerJob; utilization; queueDepth; slots; costHistory7d: number[]; serves: { id: string; name: string; arrPerMonth: number }[] }`, `fleetSummaries`, `FleetDetail = FleetSummary & { notes; policy; workloads: { id; name; sizeClass; tier; ruleId; avgTokensPerJob; jobsPerHour; costPerDay; errorRate; minTier; repricedPerDay: Record<Tier, number> }[]; tokenCurve7d: { t; byTier: Record<Tier, number> }[]; errorBudgetUsed: number; incidents: Incident[] }`, `fleetDetail`, `RoutingRow { rule; workloadsCovered: string[]; tokensPerDay; costPerDay }`, `RoutingWorkload { id; fleetId; name; sizeClass; minTier; tier; ruleId; repricedPerDay: Record<Tier, number> }`, `RoutingTable { rows: RoutingRow[]; workloads: RoutingWorkload[]; grid: Record<SizeClass, Record<Tier, { tokensPerDay; costPerDay; jobsPerDay; repricedPerDay: Record<Tier, number>; belowFloor: Record<Tier, number> }>> }`, `routingTable`. Per-day figures are trailing 24 h from `hourly`; 7-day re-pricing uses the trailing 168 h. Every ratio in this file is guarded the way §3.4 step 7 guards the runtime: a zero denominator yields 0, never NaN.
`explore.ts` per §3.8: `export interface ExploreQuery`, `ExploreSeries`, `ExploreResult`, `explore(state, q)` (`top` default 10; `fleetId` filters before grouping; `link` is a typed target, never a hash). `index.ts` re-exports everything public from types, rng, time, constants, physics, world, step, events, metrics, explore — every name a room or store consumes is declared here, none is anonymous. `report.ts`: `bun run src/sim/report.ts [seed]` prints with `console.table` the opening-month P&L by line (revenue; tokens healthy / A / B; capacity healthy / A / C; opex; burn), runway, bankruptcy week, opening slope, and slope after each single fix and all fixes, plus the `bleeds: all false` baseline; no other IO.
Test helpers: `fixA = { type: 'routing.set', rule: { id: 'op-trivial', priority: 1, match: { sizeClass: 'trivial' }, tier: 'small', author: 'operator' } }`; `fixB = { type: 'fleet.policy', fleetId: 'halberd-monitor', patch: { retry: { circuitBreaker: true, backoff: 'exponential' } } }`; `fixC = idle.map(id => ({ type: 'fleet.policy', fleetId: id, patch: { scaleToZero: true } }))`.

**Acceptance.**
- `bun test tests/sim` passes in under 60 s.
- Untouched: `(bankruptAt − PRELUDE_HOURS)/168 ∈ [23, 30]` for seeds 1..10; opening slope ∈ [−6.5M, −5.0M]/wk (the same window in two units — never widen one without the other).
- Fix (a) at login: after 2 sim-weeks `|slope| < 0.6 × |slope₀|`. Fix (a)+(b)+(c) at login: `slope > 0` after 4 sim-weeks; `cash(wk 8) > cash(wk 4)`; applied at week 16 the run never goes bankrupt through week 52. `bleeds: all false` → slope > 0 at login.
- Pause is priced (slopes after 2 sim-weeks, seeds 1..10): `fleet.policy { status: 'paused' }` on `summarizer-east` alone is worse than `fixA`; on `halberd-monitor` alone worse than `fixB`; on both worse than `fixA` + `fixB`; on every fleet still < 0.
- Live-with-actions state deep-equals `replay(log, t)`; `step(s,168)` deep-equals 168 × `step(s,1)`; input not mutated.
- 200 seeded random actions (incl. pauses and `concurrency: 0`) over 26 weeks: no NaN/Infinity in state or in any selector output; no negative tokens/costs/queues/slots; `queue' ≤ a + queue`; `hourly.length ≤ HOURLY_WINDOW`; `daily.length === floor(t/24)`. One fleet paused 2 wk and every fleet paused 2 wk → error rate, attempts/job and error budget read 0.
- At login: `hourly.length === 672`, `daily.length === 28`, `cash === OPENING_CASH`, `hourly[0].cashClose > OPENING_CASH`, `status === 'running'`; `openIncidents` contains `retry-storm`/`halberd-monitor`; enabling the breaker closes it within 24 h.
- `bun run src/sim/report.ts` prints the table and exits 0.
- `bun test tests/sim/literals.test.ts` passes: every numeric literal in `src/sim/step.ts` is in {0, 1, 2, 24, 100, 1e6, 3600} (a plain grep cannot do this — it matches `hash32`, `fnv1a` and the allowed set — so the test strips comments and strings and tokenises).

### T4 — Build and serve: console at `/`, cockpit at `/cockpit/`, watcher over sim + console

**Owns:** `package.json`, `src/build.ts`, `src/server/index.ts`, `src/server/dev.ts`, `tests/build.test.ts`, `README.md`. **Depends on:** none.

**Spec.** Per §4.7. `buildClient` copies the cockpit html to `${outdir}/cockpit/index.html` (mkdir -p) and is otherwise byte-for-byte the current behaviour. `buildConsole(outdir, entry, html)` with `plugins: [sveltePlugin()]`, `splitting: false`, the `naming` map, `sourcemap: prod ? 'none' : 'inline'`, `minify: prod`; missing entry → log and return; build failure → print logs and throw. `buildAll(outdir)` = cockpit then console. Server: directory → `index.html` resolution before the SPA fallback; MIME map and `/api` untouched. Dev: `buildAll`, three `watch` calls, shared debounce, the log line. `package.json`: `sim:report`, `typecheck`; no new dependencies. README: tree and quickstart (console at `/`, cockpit at `/cockpit/`, `bun run sim:report`, `bun run typecheck`), a "Console — first slice" section (room map, ⌘K, time controls and speed factors, the localStorage key and how to reset, "not in this slice" list pointing at the hooks). Keep the Game voice. Do not touch `src/client/**` or `src/svelte-plugin.ts`.
`tests/build.test.ts`: `mkdtemp`; write a minimal `main.ts` that does `import './t.css'`, a one-rule `t.css`, and an `index.html`; `buildClient(tmpOut)`; `buildConsole(tmpOut, tmpEntry, tmpHtml)`; assert `index.html`, `console.js`, `console.css`, `main.js`, `cockpit/index.html` exist, root `index.html` references `/console.js`, and `console.css` contains the rule; `buildConsole(tmpOut, 'nope/main.ts', tmpHtml)` resolves without throwing; clean up. This is the wave-1 proof that a CSS import reaches the output as `console.css` (verified by hand on Bun 1.3.14 before this plan was revised), so T5 and T9 can rely on the `<link>`.

**Acceptance.**
- `bun test tests/build.test.ts` passes.
- Cockpit bundle unchanged except the html destination.
- Server: `GET /cockpit` and `/cockpit/` → cockpit html (200, text/html); `GET /` and `GET /anything` → console html (or, before T9 lands, the cockpit html since `buildConsole` skipped — documented); `GET /api/models` still proxies.
- `bun run dev` logs `[dev] watching src/client, src/console, src/sim` and rebuilds on a change in any of the three; it works in every wave (no throw on a missing console entry).
- README's quickstart says the console is at `/` and the cockpit at `/cockpit/`.

### T5 — Console foundation: html, router, formatting, persistence, RunController, game store

**Owns:** `src/console/index.html`, `src/console/router.ts`, `src/console/router.svelte.ts`, `src/console/format.ts`, `src/console/persistence.ts`, `src/console/core/run.ts`, `src/console/stores/game.svelte.ts`, `tests/console/router.test.ts`, `tests/console/format.test.ts`, `tests/console/persistence.test.ts`, `tests/console/run.test.ts`. **Depends on:** T3.

**Spec.** `index.html`: `<title>spaghetti :: console</title>`, viewport meta, inline base css (`html,body{margin:0;height:100%;background:#0D0D12}`, `#app{height:100%}`, reduced-motion guard), `<link rel="stylesheet" href="/console.css">`, `<div id="app">`, `<script type="module" src="/console.js">`. No external resources (`/console.css` and `/console.js` are same-origin build outputs). `theme.css` is imported from `App.svelte` (T9); Bun emits it as `console.css` (§4.7, proven by T4's build test), and the `<link>` is how it reaches the page. There is no inline fallback and no task other than T5 edits this file.
`router.ts` (pure) and `router.svelte.ts` (`class Router { current = $state<Route>(parseRoute(location.hash)); navigate(to: Route | string); start(); stop() }`, `export const router`) per §4.3.
`format.ts` (pure, U+2212 minus): `money(n, { compact = true })` → `'−$5.74M'`, `'$150M'`; `moneyPerWeek(n)` → `'−$5.74M/wk'`; `moneyPerDay(n)`; `tokens(n)` → `'2.60T'`, `'41.5K'`; `pct(x, digits = 1)` → `'55.3%'`; `num(n)`; `slots(n)`; `clockLabel(t)` (wraps `simClock(sinceLogin(t))`); `weeks(w: number | null)` → `'26.1 wk'` | `'climbing'`; `signed(n, fmt)`.
`persistence.ts` per §4.6 with an injectable `Storage`. `core/run.ts` per §4.2, including `MemStorage`-friendly deps, checkpoints appended when `advance` crosses a multiple of `CHECKPOINT_EVERY_HOURS`, `awaySummary` set by `boot` when catch-up advanced > 0 hours, `lastAdvance` on every advance, `pendingAction` recorded by `dispatch` and `payoff` computed with `metrics.weeksBought` only when an action is pending and ≥ `PAYOFF_MIN_HOURS` have elapsed since it (tick-driven advances with nothing pending never touch `payoff`), `// TODO(intro)` and `// TODO(prestige)` hooks. `stores/game.svelte.ts` per §4.2: constructs `RunController` with `safeStorage()`, mirrors `state`/`lastAdvance`/`awaySummary`/`paused`/`speed` through `onChange`, owns the 1 s `setInterval` (`startClock/stopClock`), flushes saves on `visibilitychange`/`pagehide`.
Tests: router, format (the exact strings above), persistence (`class MemStorage implements Storage` over a `Map`), run (scenarios in acceptance).

**Acceptance.**
- `bun test tests/console` passes; no test imports a `.svelte` or `.svelte.ts` file.
- `parseRoute('#/spend?group=model&range=7d&fleet=summarizer-east')` → `{ room: 'spend', query: { group: 'model', range: '7d', fleet: 'summarizer-east' } }`; `parseRoute('')` → overview; `href` round-trips every route, `fleet=` and `top=` included (the query is passed through, not whitelisted).
- `money(-5_740_000) === '−$5.74M'`, `money(150_000_000) === '$150M'`, `tokens(2.6e12) === '2.60T'`, `tokens(41_500) === '41.5K'`, `pct(0.553) === '55.3%'`, `weeks(null) === 'climbing'`.
- RunController: `newRun(1)` → `advance(168)` → `dispatch(fixA)` → `replay(log, state.t)` deep-equals `state`; `boot()` with a saved record whose stamp is 24 h old at speed 1 advances 168 and sets `awaySummary.hours === 168`; a paused record does not advance; `isFirstLogin` true only when `boot` created the run.
- Payoff: `tick()` advances with no dispatch leave `payoff === null`; `dispatch(fixA)` + `advance(1)` → still `null`; + `advance(167)` → `payoff.bought.kind === 'delta'` with `weeks ≥ 2` and `hoursSinceAction === 168`; a further `advance(168)` with no dispatch leaves `payoff` identical; all three fixes + 4 wk → `climbing`; `routing.remove('op-trivial')` + 1 wk → `nowFinite` with a finite `runwayWeeks`.
- `index.html` loads no external resources and links `/console.css` before `/console.js`.

### T6 — Presentational components, theme tokens, palette mirror, fuzzy matcher

**Owns:** `src/console/theme.css`, `src/console/palette.ts`, `src/console/palette/fuzzy.ts`, `src/console/components/Rail.svelte`, `StatusPill.svelte`, `Stat.svelte`, `Panel.svelte`, `DataTable.svelte`, `TimeSeries.svelte`, `BarList.svelte`, `TierBadge.svelte`, `Note.svelte`, `tests/console/palette.test.ts`. **Depends on:** T1 (types only).

**Spec.** No component imports from `src/console/stores`, `src/console/core` or `src/sim` beyond `types` — props only, so this task runs in parallel with the sim core.
`theme.css`: `:root` tokens exactly §5.1; base element styles (body `--font-ui`; `.mono`/`.data` → `--font-data` with `tabular-nums`; `.pill`, `.panel`, `.btn`, `.btn-accent`, `.input`, `.money`, `.dim` primitives; focus ring in `--accent`; `@media (prefers-reduced-motion: reduce)` disables transitions). Dark-only in this slice. No color literal outside the token block.
`palette.ts`: `COLORS` (every token by name), `SERIES = [cat-1..cat-7]`, `MARKERS = ['●','▲','■','◆','▼','⬟','○']`, `DASHES` (`''` for index 0–2, then `'6 3'`, `'2 3'`, `'8 3 2 3'`, `'1 3'`), `seriesStyle(i): { color; marker; dash }`, `MONEY`, `TIER_COLOR: Record<Tier, string>`, `TIER_LETTER`, `luminance(hex)`, `contrast(a, b)`. Comment: must mirror `theme.css`.
`palette/fuzzy.ts`: `fuzzyScore(query, text): number`, `rank<T>(query, items: T[], text: (t: T) => string, limit = 12): T[]`.
Components (Svelte 5, `$props()`, snippets, no UI libs):
- `Rail.svelte` `{ current: Room; rooms: { room; label; hotkey; href }[]; footer?: Snippet }` — vertical nav, active item marked by a 3 px `--accent` bar + bold + `aria-current` (never color alone); hotkey hints; ⌘K hint at the bottom.
- `StatusPill.svelte` `{ status: 'active'|'paused'|'storm'|'breached'|'idle'|'good'|'warn'|'bad'; label?: string }` → glyph + label (active ●, paused ‖, storm ▲, breached ✕, idle ◌, good ●, warn ▲, bad ✕), `aria-label`.
- `Stat.svelte` `{ label; value: string; sub?: string; history?: number[]; tone?: 'money'|'neutral'|'good'|'warn'|'bad'; status?: 'good'|'warn'|'bad'; goodWhen?: 'up'|'down'; href?: string }` — big mono value, sans label, optional `Sparkline` (from `../../client/components/Sparkline.svelte`), number roll via `animateSpring` honouring reduced motion. `tone` colours the value; `status`, when given, renders a `StatusPill` (glyph + word) beside the value — a tile never signals state by hue alone, so a room that flips `tone` to good/warn/bad passes `status` with it.
- `Panel.svelte` `{ title; subtitle?; actions?: Snippet; children: Snippet }` — card with `springReveal` on mount.
- `DataTable.svelte` generic `{ columns: { key; label; align?; sortable?; format?: (row) => string; cell?: Snippet<[row]> }[]; rows: T[]; rowKey: (row) => string; sortKey?; sortDir?; onSort?; onRowClick?; rowHref?: (row) => string }` — mono numeric cells, sticky header, `aria-sort`, keyboard row focus (Enter opens).
- `TimeSeries.svelte` `{ bucketT: number[]; series: { key; label; values: number[] }[]; stacked?; height?; money?; formatY: (v) => string; formatX: (t) => string; projection?: { bucketT: number[]; values: number[] }; zeroLine?; onSeriesClick? }` — SVG via d3-shape `line`/`area`/`stack` with `curveMonotoneX` (values must not be misdrawn); series styled by `seriesStyle(i)` (money → solid `--money`); direct labels at line ends; legend below with swatch + marker + dash + label; `projection` drawn dashed in `--fg-muted`; hover crosshair with per-series values in mono; responsive via `bind:clientWidth`; `aria-label`.
- `BarList.svelte` `{ items: { key; label; value: number; share: number; hint?; href? }[]; fmt: (v) => string; tone?: 'money'|'series' }` — label | bar | value | share%, direct value labels, marker glyph per row when tone is series, rows are links when `href` is given.
- `TierBadge.svelte` `{ tier: Tier; share?: number }` — colored swatch square + letter S/M/F + name in `--fg` (never colored text).
- `Note.svelte` `{ note: CoFounderNote }` — italic `--font-ui`, date in mono muted, thin accent left rule; no attribution line, no added text.
`tests/console/palette.test.ts`: contrast rows of §5.2 (≥ 4.5 for text tokens on bg-1 and bg-2; ≥ 3 for every series color); `SERIES` excludes the money hex; `SERIES` and `Object.values(TIER_COLOR)` share no hex with `{ good, warn, bad }` (case-insensitive); `MARKERS` distinct; `fuzzyScore('hal', 'halberd-monitor') > fuzzyScore('hal', 'chinook · summarizer')`; non-subsequence → 0; exact prefix ranks first.

**Acceptance.**
- `bun test tests/console/palette.test.ts` passes.
- Every component compiles under the Bun Svelte plugin with zero `[svelte]` warnings (checked by T9's smoke test).
- `StatusPill` renders glyph + text for every status; `TierBadge` always renders the letter and the name; `Stat` with `status` renders the pill beside the value; none differs by color alone.
- No status hex equals any series or tier hex (the palette test proves it); `theme.css` and `palette.ts` agree byte-for-byte on every token.
- `TimeSeries` with 7 series uses `--cat-1..7` in order, draws a legend with markers, dashes index ≥ 3, draws `projection` dashed, and does not throw on empty or single-point input.
- `theme.css` defines every token in §5.1 and no other color literal.

### T7 — Rooms: Overview, Fleets, Fleet detail

**Owns:** `src/console/rooms/Overview.svelte`, `src/console/rooms/Fleets.svelte`, `src/console/rooms/FleetDetail.svelte`. **Depends on:** T5, T6.

**Spec.** All rooms read only from `game` selectors and write only via `game.dispatch`; `router.current` for params, `href()` for anchors; view models in `$derived`.
`Overview.svelte`: two large `Stat`s (runway, money tone, sub `cash $150M`; net/wk, sub `trailing 7 sim-days`); `Panel` "cash" with a `TimeSeries` (`money`, `values` = last 28 `daily.cashClose`, `projection` = 28 daily points along `game.slope` from the last close, `zeroLine`) and a line `cash reaches zero ≈ wk N (M wk from now)` or `climbing`; a 4-up of headline `Stat`s (`runway → money`, `net → money`, `tokens → neutral` with `href` to `#/spend?group=model`, `errors` → when > 5%: `tone: 'bad'`, `status: 'bad'` and `sub: 'above 5% budget'`, else neutral with `sub: 'within budget'` — the state is always glyph + words, never the hue alone) with 28-day sparklines; `Panel` "open incidents" listing `game.incidents` (StatusPill storm/breached, summary, cost/day in money, `since` (a sim-hour) via `clockLabel`, link to the fleet built with `href({ room: 'fleet', id })`) or `no open incidents`; a `Panel` "where the money goes" that is one link row to `#/spend?group=fleet`. No dispatch calls in this file.
`Fleets.svelte`: `DataTable` over `game.fleets`; status derivation: paused → paused; `attemptsPerJob > 1.5` → storm; `utilization < 0.05 && slots > SCALE_TO_ZERO_MIN_SLOTS && queueDepth === 0` → idle; else active; columns per §4.4; default sort cost/day desc; sort state in `localStorage` key `spaghetti.console.fleets.sort` (try/catch); header line with total cost/day and counts by status; a trailing controls cell with `pause`/`resume` (→ `fleet.policy { status }`) and a `scale to zero` toggle (→ `{ scaleToZero }`), each labelled with the term and a one-line `title` definition; the pause button's `title` states the fact from `serves`: `pausing breaches N customers after 24 h: $X/mo revenue` — a reading, not a warning; row click / Enter → `#/fleets/:id`.
`FleetDetail.svelte`: `game.fleet(router.current.id)`; unknown → `no such fleet` with a link back. Sections: header (name mono, role, family, StatusPill, links `Spend Explorer →` `#/spend?group=workload&fleet=<id>` and `Routing →`); notes (`Note` list); `Panel` "workloads" `DataTable` (name, size class as text chip, `TierBadge` + rule id or `default`, avg tok/job, jobs/h, cost/day, error %, `eval ≥ M` chip; a `title` on the cost cell listing `repricedPerDay` at S / M / F); `Panel` "tokens · 7d" `TimeSeries` stacked by tier; `Panel` "error budget" (text `x% of 7-day budget used`, meter bar `--warn`/`--bad` with label, attempts/job); `Panel` "policy": select `routing policy` [inherit rules | small | medium | frontier] → `routing.set { id: 'op-fleet-<id>', priority: 10, match: { fleetId }, tier, author: 'operator' }` or `routing.remove` for inherit, with the re-priced cost/day for the selected tier shown beside it as `last 7d at <tier>: $X/day`; `concurrency` number input (step 25, min 0) → patch; `scale to zero` toggle; retry policy sub-section (`max attempts` 1–5, `backoff` none/exponential, `circuit breaker` toggle → patch `{ retry }`) with `// TODO(incidents): moves to the Incidents room`; `Panel` "incidents" for this fleet. Every control carries the real term and a plain one-line definition; none carries a recommendation.

**Acceptance.**
- Overview renders the cash curve with a dashed projection, four `Stat` tiles, the incidents list with a link to `#/fleets/halberd-monitor` at first login, and no control that dispatches.
- Fleets renders 40 rows sortable by every column; pause/resume and scale-to-zero dispatch `fleet.policy` and the row changes on the next tick; the six idle rivers show `idle` with utilization 0% and 8 800 slots; every pause button's `title` names at least one customer.
- The Overview `errors` tile above 5% shows a `✕ bad` pill and the words `above 5% budget`; under grayscale the state is still legible.
- Fleet detail for `summarizer-east` shows the canonical note, two trivial workloads on frontier attributed to `cf-summarizer-east`, tier mix 100% frontier, and the re-priced `small` figure ≤ 5% of the current cost/day; choosing `small` dispatches exactly one `routing.set`; `inherit rules` dispatches `routing.remove`.
- Fleet detail for `halberd-monitor` at first login shows attempts/job > 1.8 and a storm pill; enabling the circuit breaker then `+1 day` drops attempts/job below 1.2 and the incident disappears from Overview.
- Unknown id renders `no such fleet`; nothing throws.

### T8 — Rooms: Models & Routing, Spend Explorer

**Owns:** `src/console/rooms/Routing.svelte`, `src/console/rooms/Spend.svelte`. **Depends on:** T5, T6.

**Spec.** `Routing.svelte`: `const table = $derived(game.routing)`. Header sentence: `Lowest priority number wins. A rule applies to every workload its match fits.` Section "routing rules": `DataTable` rows sorted by priority — priority, match (`fleet summarizer-east`, `class trivial`, `workload ticket-summary`), `TierBadge`, note (italic when cofounder), author (text chip), workloads covered, tokens/day, cost/day; inline tier select → `routing.set` with the same id (author becomes `operator`); remove → `routing.remove` (co-founder rules removable; `// TODO(audit-log)`). Section "add rule": match by size class (any/trivial/standard/heavy) and/or fleet and/or workload (filtered by fleet), tier, priority (default 1), optional note; the form computes the matched set from `table.workloads` and shows two facts side by side: `last 7d re-priced at <tier>: $X/day` (Σ `repricedPerDay[tier]`) and `N workloads below eval floor at <tier>` (count with `TIER_RANK[minTier] > TIER_RANK[tier]`; `0 workloads below eval floor` when none — the penalty is as visible as the price); submit → `routing.set` with `id: 'op-' + (count of routing.set events in game.run.log + 1)`. Section "effective routing": 3×3 grid rows trivial/standard/heavy × cols S/M/F; each cell cost/day (money) + jobs/day + a `title` listing `repricedPerDay` **and** `belowFloor` per tier (`at small: $4.5k/day · 0 below floor`); cell background intensity by cost share *plus* the number; `router.current.query.tier` outlines that column. Section "models": three rows (tier, name, $ in/M, $ out/M, tok/s, base error) — facts, no lever.
`Spend.svelte`: `group`, `range`, `top`, `fleet` from `router.current.query` (defaults fleet / 7d / 10 / none); controls write back via `router.navigate(href(...))` so views are linkable; `const result = $derived(game.explore({ range, groupBy, top, fleetId: fleet || undefined }))` — the fleet filter is the sim's own `fleetId`, passed straight through for every group-by, so the chip and the numbers are the same selector; filter chip (`fleet: summarizer-east ×`) with a clear link. Panels: "spend over time" `TimeSeries` stacked, `money`, `onSeriesClick` → `router.navigate(linkHref(series.link))`; "spend by <group>" `BarList` (value = total over range, share, `hint` = `tokens(series.tokens / days) + '/day'`, `href` = `linkHref(link)`; `other` and `customer` links have none); footer `range total $X · N buckets of 1 h / 24 h`. `linkHref(link: ExploreLink | null)` is a local pure function over `href()`: `fleet` → `{ room: 'fleet', id }`, `workload` → `{ room: 'fleet', id: link.fleetId }`, `tier` → `{ room: 'routing', query: { tier: id } }`, `customer` or `null` → `null`. No dispatch calls anywhere in this file.

**Acceptance.**
- Routing shows the rules table with `cf-summarizer-east` (`eval pending`, author cofounder) at first login; the grid's trivial × frontier cell shows cost/day ≈ $440k, its re-priced `small` figure ≤ 5% of that, and `0 below floor` at small.
- The add-rule form with `{ sizeClass: heavy } → small` selected shows a non-zero `below eval floor` count before anything is dispatched; with `{ sizeClass: trivial } → small` it shows `0`.
- Adding `{ sizeClass: trivial } → small` dispatches one `routing.set`; after `+1 week` the trivial × frontier cell is ≈ 0 and Overview's slope magnitude has at least halved.
- `#/routing?tier=frontier` outlines that column.
- Spend at first login with the default `top` (10) and group-by fleet shows `summarizer-east` first (share ≥ 30%) and all six idle rivers as rows with non-zero cost and a `0/day` tokens hint; group-by model shows frontier ≥ 55%; group-by customer shows `Halberd Capital` as the largest named account; totals equal `explore().total` and agree across group-bys.
- `#/spend?group=model&fleet=summarizer-east` shows the chip and a single `frontier` series whose total equals that fleet's cost in the fleet group-by; clearing the chip restores the unfiltered view.
- Fleet/workload rows navigate to `#/fleets/:id`; model rows to `#/routing?tier=<tier>`; `other` and customer rows have no link; controls update the hash.

### T9 — Integration: App shell, top bar, palette, main.ts, smoke + walkthrough tests, runbook

**Owns:** `src/console/App.svelte`, `src/console/main.ts`, `src/console/components/TopBar.svelte`, `src/console/components/Palette.svelte`, `src/console/stores/palette.svelte.ts`, `tests/console/smoke.test.ts`, `tests/console/walkthrough.test.ts`, `docs/E-Development/001-first-slice.md`. **Depends on:** T1–T8.

**Spec.** `main.ts`: `mount(App, { target: document.getElementById('app')! })`.
`App.svelte`: imports `./theme.css`, `router`, `game`, `palette`, `Rail`, `TopBar`, `Palette`, the five rooms. On mount: `router.start(); game.boot(); game.startClock()`; `// TODO(intro): when game.run.isFirstLogin, play the intro sequence (src/client/components/BootFlicker etc.) before revealing Overview`. Layout grid `rail | (topbar / room)`; room switch keyed on `href(route)` so panels re-reveal. Global keydown: first, return early when `event.isComposing` or `event.target` is an `input`, `select`, `textarea` or `[contenteditable]` (a rule note, a fleet filter, the concurrency field) — then ⌘K/Ctrl+K → `palette.toggle()`; open: arrows/Enter/Esc; closed: `g o|f|r|s` chords (500 ms); Space toggles pause only when focus is on `body`. `$effect` once on bankruptcy → `// TODO(prestige): onBankrupt(state)`.
`TopBar.svelte` per §4.5, reading `game`; `Palette.svelte` modal (`role="dialog"`, autofocused input, `role="listbox"` with `aria-activedescendant`, kind glyph + hint per row). `stores/palette.svelte.ts` per §4.5 using `palette/fuzzy.ts`.
`tests/console/smoke.test.ts`: `buildConsole` of `src/console/main.ts` into `mkdtemp`; capture `console.warn`; assert success, `console.js` > 10 KB, `console.css` exists and contains `--accent`, the emitted `index.html` contains `href="/console.css"`, no `fonts.googleapis`, zero `[svelte]` warnings.
`tests/console/walkthrough.test.ts`: the §6 walkthrough on `RunController` + `MemStorage`.
`docs/E-Development/001-first-slice.md`: what shipped; how to run; the three discovery walkthroughs with numbers pasted from `bun run sim:report`; the constants-file pointer; the persistence format; the hook list with `file:line` references (`TODO(intro)`, `TODO(prestige)`, `TODO(incidents)`, `TODO(audit-log)`, `PostMortemHook`, SQLite noted as "persistence/ later"). Game voice, measured; no marketing.

**Acceptance.**
- `bun run build` succeeds with zero `[svelte]` warnings; `bun test` passes in full; `bun run typecheck` passes.
- `bun run dev` serves Overview at `http://localhost:5173/`, the cockpit at `/cockpit/`; a hard refresh preserves `t` and the log with catch-up applied and the away line shown once.
- ⌘K / Ctrl+K opens the palette; `halb` + Enter lands on `#/fleets/halberd-monitor`; Esc closes; `g o/f/r/s` navigate; typing `go small` into the Routing note field navigates nowhere and keeps the draft.
- After `+1 week` following the trivial → small rule the top bar shows `▲ +N wk bought` in accent; `+1 week` with no action shows no badge at all (at 1008× the bar stays quiet while the clock runs); an action that changes nothing (e.g. a rule matching no workload) then `+1 week` shows `no change` in grey; after all three fixes and enough weeks it shows `▲ climbing`; removing the trivial rule from a climbing run and waiting a week shows `runway now finite · N wk` in grey, never `climbing`.
- `walkthrough.test.ts` passes with the tolerances in §6.

---

## 8. Hooks left for later (typed, no behaviour)

| Hook | Where |
|---|---|
| Intro sequence | `App.svelte` `TODO(intro)` gated on `game.run.isFirstLogin` |
| Prestige / post-mortem | `events.ts` `PostMortemHook`; `run.ts` `newRun` `TODO(prestige)`; `App.svelte` bankruptcy effect; `TopBar` "new run" |
| Incidents room | `Incident` type and `openIncidents` selector; retry policy panel `TODO(incidents)` |
| Audit log | every `SimEvent` already carries `t` and `wallMs`; `Routing.svelte` `TODO(audit-log)` |
| Customers room | `explore(groupBy: 'customer')` and `CustomerDef.servedBy` |
| Budgets room | `explore` per-fleet totals; no cap fields yet |
| Runbooks room | `FleetDef.notes` and `NOTES` |
| Copilot | none needed; the game must run with Ollama off, and does |
| SQLite | `SaveRecord` is the row shape; `persistence.ts` is the only writer |

---

## 9. Risks

1. **Tuning.** The generator derives token volumes and slots from `WorldParams` and the shared `WorldPhysics`; the opening P&L will not hit §3.6 on the first run. `bun run sim:report` plus outcome-pinned tests are the mitigation; only `constants.ts` moves, and because the generator takes its physics from the same constants, a retune cannot leave provisioned capacity disagreeing with the job-hours `step` charges. The bankruptcy window [23, 30] (= the opening-slope window [−6.5M, −5.0M]/wk in weeks), the pause ordering and the flatten/inflection assertions are the contract, not the intermediate lines.
2. **Margin after all three fixes** (≈ +$1.5M/sim-month against $11.67M revenue, ≈ +$2.0M once `summarizer-east` scales to zero). The healthy token line is pinned by `healthyTokensPerMonth`, `healthyTierMix` and `healthyOutFraction`, so template authoring cannot move it by more than the ± 0.02 the world test allows (≈ ± $0.1M/mo). Residual error penalties, the diurnal peak or leftover provisioned slots on `summarizer-east` are already in the §3.6 arithmetic. The `bleeds: all false` baseline test isolates the healthy company; if the margin is still too thin across seeds, lower `FIXED_OPEX_PER_MONTH` before touching anything else (each $0.1M off opex moves bankruptcy by ≈ 0.1 wk, well inside the window).
3. **Reserved capacity as a third cost line** extends the brief's "tokens + opex" wording. It is required for scale-to-zero to mean what it means. The design doc §2 table should be amended to list it.
4. **Storm dynamics.** With §3.6 constants the planted storm pins at `STORM_EXCESS_CAP` during the prelude (by hour ≈ 55) and holds there — a saturated, not a worsening, storm at login; §3.5 (b) and the incident's `since` say so. Re-run the economy tests after any change to gain, cap or recovery rates. Breaker hysteresis (`TRIP 0.20`, `RESET 0.10`) prevents flapping. `MAX_ERROR_RATE` must stay < 1: `attemptsMultiplier` is `(1 − p^k)/(1 − p)` and only its p ≥ 1 branch (`= k`) keeps it finite above that. Re-queueing while the breaker is open is bounded by `queue' ≤ a + queue` and converges to `p·a/(1 − p)` unless the fleet is capacity-limited (`slots/(m·jobHours) × (1 − p) < a`), in which case the queue grows without bound and a `backlog` incident opens — the honest consequence of a structurally under-tiered workload behind a breaker, and why trivial templates are pinned to `minTier: 'small'` (T2).
5. **The 100% SLA-credit rule** is a coarse stand-in for contract economics (out of scope). It exists so that pausing any fleet costs the revenue it serves — every fleet has a home segment (T2), the Fleets row prices the pause in its `title`, and the economy tests pin that each honest fix beats pausing its fleet and that pausing the top two rows by cost is worse than fixing them. Fleet detail shows queue and breach status so the consequence is legible.
6. **Floating-point determinism holds within one JS engine.** Checkpoint hashes may differ across browsers on the same log; the load path warns and trusts replay.
7. **Bun.build with a second entry, `naming`, and a CSS import from a component** is lightly trodden on Bun 1.3.14. Verified by hand before this revision: the CSS is not inlined into `console.js`; it is emitted as a sibling `console.css` under the `entry` naming. T4's build test pins that in wave 1, `index.html` links it (T5), and T9's smoke test re-checks the real entry. There is no inline fallback and no cross-ownership edit.
8. **Memory.** The 672-hour ring × ~100 workloads plus daily rollups is a few MB of objects; zero-job workloads are already omitted. Move to typed arrays only if profiling says so.
9. **One decision per screen is stretched** on Fleet detail (routing + concurrency + retry policy) until an Incidents room exists. The Overview incident → fleet link is the bridge; the room's primary panel is routing + concurrency, and the retry section is visually secondary.
10. **The retry lever is honest but coarse:** the breaker sheds retries and the dependency recovers by a constant; a real dependency recovers on its own timeline. Acceptable at this fidelity; the term still means what it means.
11. **Colorblind safety is enforced by rule and a small contrast test, not by tooling.** Status hues are tints that share no hex with any series or tier token (the palette test proves the disjointness), but `--bad` and `cat-6` are still near-identical under protanopia (§5.2), which is why status hues never appear as series. Every tile, pill and badge carries a glyph and a word; a reviewer rejects any room that encodes state by hue alone; the grayscale check is manual.
12. **Cross-tree imports** of `src/client/components/Sparkline.svelte` and `src/client/motion` keep the console coupled to the cockpit slated for retirement; acceptable for the slice, one later task moves them into a shared folder.
13. **`bun test` cannot compile `.svelte`/`.svelte.ts`,** so stores and components have no unit tests; every algorithm is in plain `.ts` (`core/run.ts`, `router.ts`, `format.ts`, `persistence.ts`, `palette/fuzzy.ts`, `palette.ts`, all of `src/sim`) and the smoke test covers compilation. A rune wrapper bug would surface only in play.
14. **Names and notes are content.** The mechanical checks (no "you"/"operator"/"player", no emoji, dated) catch the obvious; tone needs a human read against `content-language.md`.
15. **The existing motion test has a timing flake** on slow containers (one failure observed on a 36 s run, none on rerun). It is not touched by this slice; a full green `bun test` may need a second run on a loaded machine.
