# 001 — First Slice · runbook

> Branch: `design/v-shape-prestige` · Written: 2026-09-15
> Plan: `docs/D-Design-Exploration/02-first-slice-plan.md` (authoritative). This note records what shipped, how to run it, and where the seams are.

---

## 1. What shipped

A playable console over a deterministic, aggregate economy. One loop — notice → investigate → act → wait → verify — walked by hand on first login, with three planted bleeds so the walk has three laps and pulling all three levers crosses the inflection.

```
src/sim/       pure TypeScript, no DOM, no IO, no wall clock.  step(state, dtHours, config, rng) → state
               ledger of rates · three planted bleeds · event log + replay · selectors (metrics, explore) · tuning report
src/console/   Svelte 5 runes. Served at "/". Five rooms, shell, ⌘K palette, time controls.
               Every number a room shows is a selector over the ledger. Every write is game.dispatch(action).
src/client/    the pre-pivot cockpit, untouched, served at "/cockpit/".
```

Rooms and the one decision each holds:

| Room | Route | Lever |
|---|---|---|
| Overview | `#/overview` | none |
| Fleets | `#/fleets` | pause / resume · scale to zero |
| Fleet detail | `#/fleets/:id` | routing policy · concurrency · (retry policy, until an Incidents room exists) |
| Models & Routing | `#/routing?tier=` | add / edit / remove routing rules |
| Spend Explorer | `#/spend?group=&range=&top=&fleet=` | none |

Top bar: runway · net/wk · sim clock · ▶/⏸ · speed (labelled by meaning) · `+1 day` · `+1 week` · the bought-weeks badge · the away line · `bankrupt · wk N` + `new run`.

Keys: `⌘K` / `Ctrl+K` palette · `g o` / `g f` / `g r` / `g s` rooms · `Space` pause/resume (only with focus on the page body). Keys are ignored inside inputs, selects, textareas and contenteditables.

Not built (each has a typed hook, §5): intro sequence, prestige / post-mortem, Incidents room, audit log, Customers room, Budgets, Runbooks, copilot, SQLite.

## 2. How to run

```sh
bun install
bun run dev            # builds, watches src/client src/console src/sim, serves http://localhost:5173/
bun run build          # dist/client: index.html + console.js + console.css, cockpit under /cockpit/
bun test               # sim + console + build tests (~70 s on a devcontainer)
bun run typecheck      # tsc --noEmit over src and tests
bun run sim:report     # the tuning report, seed 1 (bun run src/sim/report.ts 7 for seed 7)
```

The console at `/`, the cockpit at `/cockpit/`. A hard refresh keeps the run: the event log is replayed, the wall clock is caught up unless paused, and the top bar shows the away line once.

Gate for this slice: `bun run build && bun test` — zero `[svelte]` warnings, every test green.

## 3. The three discovery walks

Numbers below are seed 1 from `bun run sim:report` (2026-09-15). `tests/console/walkthrough.test.ts` reproduces the first walk headlessly and asserts every number within tolerance; `tests/sim/economy.test.ts` pins the outcomes for seeds 1–10.

Opening month (sim-months, seed 1):

```
revenue                   $11.67M
tokens · healthy          $1.79M
tokens · A (tiering)      $13.50M
tokens · B (retry storm)  $5.53M
capacity · healthy        $0.36M
capacity · A slots        $0.75M
capacity · B slots        $0.15M
capacity · C (idle)       $9.64M
opex                      $3.80M
cost                      $35.52M      burn $23.85M
opening slope / wk        −$5.49M      runway 6.29 mo      bankruptcy 27.4 wk from login
```

### Walk 1 — model tiering (`summarizer-east`)

1. **Notice.** Overview: runway `6.3 mo`, net `−$5.49M/wk`, one incident open (`retry-storm · halberd-monitor`). Nothing explains itself.
2. **Investigate.** Spend Explorer ▸ model: frontier ≈ 66% of spend. Spend ▸ fleet: `summarizer-east` on top at ≈ 45%. Fleet detail: two trivial workloads, ≈ 220 tokens/job, 100% frontier, chosen by `cf-summarizer-east`; the co-founder's note says why (`eval pending`).
3. **Act.** Models & Routing: the grid's trivial × frontier cell ≈ $445k/day; the cell's `title` reads the same tokens at small: ≈ $4.5k/day — a re-pricing of recorded tokens, not advice; `0 below floor` at small. Add the rule `class trivial → small`, priority 1.
4. **Wait.** `+1 week`.
5. **Verify.** Net ≈ `−$2.36M/wk` (ratio 0.43 against the opening slope). The top bar shows `▲ +36.4 wk bought` (seed 1: runway 27.4 wk → ≈ 64 wk, less the week that passed; the test asserts ≥ 2). The Overview's projection to zero swings right. Spend ▸ model: frontier ≈ 36%, from 66%; the trivial × frontier cell reads ≈ $0.

### Walk 2 — retry storm (`halberd-monitor`)

1. **Notice.** The incident row on Overview: `retry-storm · halberd-monitor`, open since before login, with its cost/day (excess attempts re-priced).
2. **Investigate.** Fleets: error ≈ 61%, ≈ 2.35 attempts/job, storm pill. Fleet detail: error budget burned many times over; retry policy `max attempts 5 · backoff none · circuit breaker off`.
3. **Act.** Fleet detail ▸ retry policy: circuit breaker on (and backoff exponential).
4. **Wait.** `+1 day`.
5. **Verify.** Attempts/job below 1.2; the incident leaves Overview. Alone this fix moves the slope to ≈ `−$4.80M/wk` (ratio 0.87) — the storm was ≈ $2.9M/mo of waste, the smallest of the three bleeds.

### Walk 3 — idle compute (six ingest rivers)

1. **Notice.** Spend ▸ fleet: six rivers at ≈ $53k/day each with a tokens hint in the low K/day (a trickle from one `trickle-ingest` workload at 2 jobs/h; never a literal 0).
2. **Investigate.** Fleets: utilization 0%, queue 0, 8,800 slots, `idle` pill. Fleet detail: reserved capacity is the whole cost line.
3. **Act.** Fleets ▸ `scale to zero` on each river (Fleet detail has the same toggle). Pausing a river also breaches the segment it serves after 24 h; scale-to-zero saves the same $1.6M/mo for nothing — the pause button's `title` states the price.
4. **Wait.** `+1 week`.
5. **Verify.** Alone this fix moves the slope to ≈ `−$3.26M/wk` (ratio 0.59).

### All three

Fix A + B + C → slope ≈ `+$0.53M/wk` after two weeks; runway reads `climbing`; the Overview's projection line is gone; the badge says `▲ climbing`. The `bleeds: all false` baseline (the healthy company) sits at ≈ `+$0.57M/wk` at login, so the fixed company lands where it should.

Pause is priced: pausing `summarizer-east` alone → `−$2.89M/wk` (worse than fix A's `−$2.36M`); pausing `halberd-monitor` alone → `−$5.03M/wk` (worse than fix B's `−$4.80M`).

## 4. Tuning

`src/sim/constants.ts` is the single tuning file: every numeric knob, the three model prices, and `DEFAULT_WORLD_PARAMS` (fleet counts, the bleed sizes, the healthy line, the customers). `step.ts` carries no numeric literal outside `{0, 1, 2, 24, 100, 1e6, 3600}` (`tests/sim/literals.test.ts` enforces it). Tests pin outcomes, not constants — the bankruptcy window [23, 30] wk, the flatten ratio, the inflection, the pause ordering — so a retune is a one-file edit that never rewrites a test. Loop: edit constants → `bun run sim:report` → `bun test tests/sim/economy.test.ts`.

## 5. Persistence

`localStorage[ 'spaghetti.console.run.v1' ]` = `SaveRecord`:

```ts
{ version: number;            // CONSTANTS.SIM_VERSION; mismatch → a fresh run
  seed: number;
  log: SimEvent[];            // run.start · actions (with t, wallMs) · checkpoints (t, hash) every 168 h
  time: { t; stampMs; paused; speed; carryMs } }
```

Only the log is stored; state is regenerated by `replay` (prelude + ≤ 52 weeks, under a second). Saves are debounced 250 ms and flushed on `visibilitychange`/`pagehide`. On load: replay → verify checkpoints (a mismatch is logged and replay is trusted) → wall-clock catch-up unless paused (capped at a sim-year) → the away line. `src/console/persistence.ts` is the only writer; a later SQLite backend takes `SaveRecord` as its row shape ("persistence/ later").

## 6. Hooks left for later

| Hook | Where |
|---|---|
| Intro sequence | `src/console/App.svelte:46` `TODO(intro)`, gated on `game.run.isFirstLogin` (`src/console/core/run.ts:119`) |
| Prestige / post-mortem | `src/sim/events.ts:32` `PostMortemHook`; `src/console/core/run.ts:196` `newRun` `TODO(prestige)`; `src/console/App.svelte:63` bankruptcy effect; `src/console/components/TopBar.svelte:115` "new run" |
| Incidents room | `Incident` type and `openIncidents` in `src/sim/metrics.ts`; `src/console/rooms/FleetDetail.svelte:100` and `:329` `TODO(incidents)` (the retry policy panel moves there) |
| Audit log | every `SimEvent` carries `t` and `wallMs`; `src/console/rooms/Routing.svelte:64` `TODO(audit-log)` |
| Customers room | `explore({ groupBy: 'customer' })` and `CustomerDef.servedBy`; Spend's customer rows have no door yet |
| Budgets room | `explore` per-fleet totals; no cap fields yet |
| Runbooks room | `FleetDef.notes` and `NOTES` |
| Copilot | none needed; the game runs with Ollama off |
| SQLite | `SaveRecord` in `src/console/persistence.ts:8` is the row shape; persistence/ later |

## 7. Known edges

- `bun test` cannot compile `.svelte` / `.svelte.ts`; the rune stores and components have no unit tests. Every algorithm is in plain `.ts` and `tests/console/smoke.test.ts` compiles the whole console with zero `[svelte]` warnings as the gate. A wrapper bug would surface only in play.
- Checkpoint hashes hold within one JS engine; a log carried across browsers may warn and is trusted anyway.
- `tests/motion.test.ts` (cockpit) has a timing flake on loaded machines; a second run clears it.
- Colorblind safety is by rule plus a contrast test: status hues share no hex with any series or tier hue; every tile, pill and badge carries a glyph and a word. The grayscale check (`filter: grayscale(1)` on `html`) is manual.
