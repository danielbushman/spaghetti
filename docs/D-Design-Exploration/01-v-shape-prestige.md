# V-Shape Progression & Prestige — Design Exploration

> Branch: `design/v-shape-prestige` · Started: 2026-09-15
> Status: **riff document** — nothing here is locked. Sections marked ⚖ are open decisions.
> Upstream: `docs/A-Product-Brief/product-brief.md`, `docs/B-Trigger-Map/01-business-goals.md`

---

## 1. The thesis

Today the game starts with the business already running and a runway signal
that only goes down (`telemetry.svelte.ts`: runway seeds at 6 months, base
drain + stress drain, never recovers). The V-shape makes that the whole game:

1. **You start rich and burning.** A funded AI company with a fast burn, a
   flagship contract, and a system nobody fully understands (the awakening
   fiction already establishes this).
2. **The descent.** Net cash flow is negative. Every day you don't understand
   the system, money leaves. The slope is the score.
3. **The inflection.** The player learns enough of the system — where the
   burn comes from, which levers bend it, which contracts pay — to turn steady
   burn into steady profit. The curve bottoms out and climbs.
4. **Bankruptcy → prestige.** If cash hits zero before the inflection, the
   company folds. The player starts a new company carrying what they learned
   (and only what they learned — see §5).

The learning *is* the progression. Real ops knowledge (token budgets, model
tiering, retry storms, idle compute, observability) is the lever set. This is
the Brief's "flight simulator" stance made into a loop instead of a texture.

---

## 2. Tension with the existing Brief (must resolve, not ignore)

| Brief commitment | V-shape pressure | Candidate resolution |
|---|---|---|
| **No punishment for absence** (Sam N4, Obj 1.3) | A burning business costs you while you're away. | Absence costs nothing *extra*. The business runs at the rate your configuration dictates; a well-configured system burns slowly (or earns) unattended. Learning to configure for absence is the walk-away skill. Optionally: an "unattended" burn profile the player tunes. ⚖ |
| **Walk-away pride** (Goal 1) | Hard to feel pride leaving a sinking ship. | Pride comes from *slope*, not level. "I flattened the curve by 30% today, that bought 4 days." The signal row shows slope explicitly. |
| **No energy / lockout** | Bankruptcy could read as a lockout. | Bankruptcy is instant restart. No cooldown, no gate, no purchase. The post-mortem is optional reading. |
| **Avg 4 hrs/wk** | A month-long run at 4 hrs/wk = ~16 hours of play to learn the system. | That is the budget. Design the disclosure so 16 hours is *enough* for an attentive player and *not enough* for a passive one. |
| **Honest economy, published curves** | Curves were written for a growth economy. | Re-derive. The diminishing-returns table (90s / 30min / 60min etc.) still applies per session: the sharp move is the 90-second thing; the deep dive is the weekend thing. |
| **Fun wins** | Losing for a month can be miserable. | Every lever pulled is a visible win on the slope. Bankruptcy is a ceremony (blameless post-mortem, written by the agent), not a fail screen. |

---

## 3. Time frame ⚖

The user's instinct: about one real month of play before first bankruptcy.
Options considered:

| First-run length | Pro | Con |
|---|---|---|
| **1 week** | Fast feedback, many prestiges, quick to tune. | Too shallow to teach; feels like a roguelike, not a business. Sam's "wasted evening" filter trips if he loses before he understands why. |
| **~1 month** | Fits 4 hrs/wk × 4 ≈ 16 hrs of learning. Long enough to feel loss, short enough that first bankruptcy is a rite, not an ending. | Requires ~30 days of *meaningful* content on the descent. |
| **3 months** | Deep. | First bankruptcy after 3 months reads as betrayal; players who inflect never see prestige, so the meta-loop never fires. |
| **Variable** (player-chosen seed round) | Difficulty by choice. | Hides the design's opinion; defer to later runs. |

**Working assumption:** ~1 month for run 1, fixed. Later runs may start with
different seed rounds (the carried reputation could change the starting
funding, shortening or lengthening runway — see §5).

**Sim clock mapping (proposal):** keep the existing `runway: 6 mo` display.
Map **1 real day = 1 simulated week**. 6 sim-months ≈ 26 real days ≈ a month.
All economy math lives in sim time; one constant (`simSecondsPerRealSecond`)
and the existing speed slider handle dev/test acceleration.

---

## 4. The idle loop we want to tap

Reference: the idler the maker has played for a year (name TBD — worth
mining for specific loop timings). What we take from the genre:

- **Check-in cadence on the player's schedule.** Nothing pings you. You open
  it because you want to see what happened.
- **The return reveal.** Number changed while you were away. In run 1 the
  number goes *down* — but something else goes *up*: data. Logs, traces,
  cost breakdowns, per-agent telemetry accumulate while you wait.
- **Waiting is for signal.** In real ops you change a config and wait for
  enough traffic to see the effect. That is the honest version of the idle
  wait: you flip model tiering on, then wait a sim-week for the cost
  sparkline to show whether it helped. A/B compare already exists in the
  codebase as a dev tool; it becomes a player tool.
- **Layered unlocks.** Not upgrade tiers — *disclosures*. See §6.

What we reject: infinite exponential number growth, prestige multipliers
that make the previous run meaningless, anything on the Brief's forbidden
list.

---

## 5. Prestige: what carries over ⚖

Principle: **you keep what you learned and what you wrote down.**

| Carry | Rationale |
|---|---|
| **Disclosures stay unlocked.** Panels/dashboards you earned by asking stay visible from turn one. | Progressive disclosure carried forward as structural knowledge. Run 2 starts with more of the cockpit lit. |
| **The post-mortem.** The agent writes a blameless post-mortem at bankruptcy: what burned the money, in order. It is exported and readable in run 2. | The prestige ceremony is a real ops ritual. It is also the Open Data Layer's first artifact. |
| **Playbooks / configs.** Any configuration the player saved (routing rules, budget caps, model assignments) can be re-applied. | The player's own exported save is their prestige currency. Ties Goal 3 to the core loop. |
| **Reputation** (maybe). Track record affects seed round size and client trust in the next run. | Gives runs a meta-arc. Risk: becomes a multiplier treadmill. Keep it narrative-weight, not exponential. |

What does **not** carry: cash, clients, agents, the specific system state.
Fiction: the company folds; the operator and the agent start a new one.
The awakening scene already fits ("system coming back online") — every run
opens the same way, and the agent's memory of the previous company is the
carried knowledge made diegetic.

---

## 6. Progressive disclosure as the core mechanic

The system is fully present from tick one. The player just can't *see* most
of it. Disclosure happens by asking, poking, and reading — never by tutorial.

Sketch of the disclosure ladder (each rung = a real ops concept = a lever on burn):

1. **The four signals** (runway, cpu, errors, queue). Already exists.
2. **Cost breakdown.** "Why is runway dropping?" → the agent shows spend by
   agent, by model, by client. First lever: *you can see it now.*
3. **Model tiering.** Big model doing small jobs. Lever: route cheap work to
   cheap models.
4. **Retry storms / error budgets.** Errors cost money twice. Lever: backoff,
   circuit breakers.
5. **Idle compute.** Agents running with no work. Lever: scale-to-zero,
   schedules.
6. **Context bloat.** Prompts growing every cycle. Lever: caching, trimming.
7. **Contract economics.** Which clients are profitable; what an SLA costs.
   Lever: renegotiate, drop, upsell.
8. **Orchestration fan-out.** One request → twelve agent calls. Lever:
   batching, planning.
9. **Unattended profiles.** What runs while you're away. Lever: the walk-away
   configuration. (This is the rung that resolves the absence tension.)

The agent is the disclosure surface. It leaks hints in voice (the existing
system prompt already does this) and answers questions with panels, not
paragraphs. A player who never asks burns out in a month and prestiges. On
run 2 they know to ask. That is the self-guided loop.

Risk: players who don't know what to ask. Mitigation: the agent's hints
escalate with slope. The steeper the burn, the less subtle the agent.

---

## 7. Architecture sketch ⚖

Goals: deterministic, testable headless (Goal 2.1 demands the math produce
the curves), replayable, exportable by construction, runs with Ollama off.

```
┌─ sim/            pure TS. step(state, dtSim, config, rng) → state
│                  no DOM, no IO, seeded RNG. Runs in browser, server, tests.
├─ events/         append-only log: player actions + periodic checkpoints.
│                  source of truth. JSONL (chat-log.ts already does this shape).
├─ persistence/    Bun SQLite (server) or file. runs table; each run has
│                  an event log and a carried-artifacts blob (§5).
├─ narrator/       Ollama. READS state, never writes it. Produces voice,
│                  hints, post-mortems. Optional at runtime.
├─ client/         Svelte. Renders state + disclosures. Existing cockpit.
└─ export/         state JSON + events JSONL + schema version. Companion CLI later.
```

Key decisions to make:

- **Offline progress.** On load, replay elapsed sim time deterministically
  (coarse ticks for long gaps). No server-side ticking required; the local
  Bun server may tick while the machine is on, but catch-up must work alone.
  Cap on offline time? ⚖ (Anti-punishment argues against a cap on earnings;
  the unattended profile argues the burn side takes care of itself.)
- **Sim time vs wall time.** One constant. Everything in the economy is
  expressed in sim time. The speed slider scales the constant.
- **The LLM is flavor, not authority.** The simulation must be fully
  playable from a phone check-in with Ollama unreachable. The agent narrates
  what the sim did; it does not decide outcomes. This also keeps the economy
  reproducible for Goal 2.2.
- **Event sourcing gives us**: export (Goal 3), replay for balancing, the
  post-mortem (derived from the event log), telemetry for the two-mode
  accounting, and A/B compare for free.
- **What of the existing code survives:** awakening scene, agent voice,
  telemetry signal row, speed slider, chat-log persistence, motion library.
  The random-walk telemetry gets replaced by real sim output.

---

## 8. Open questions for the riff

1. Which idler is the reference, and what are its actual timings (check-in
   interval, prestige interval, offline cap)?
2. Absence: literal burn (a real business burns while you sleep) or
   throttled/capped unattended burn? Which reading of "no punishment for
   absence" do we honor?
3. Is run 1 *designed to be lost* (roguelike tutorial run) or achievable by a
   sharp first-time player? This sets the disclosure difficulty.
4. Sim clock: 1 real day = 1 sim week, or something else?
5. Does the game need to be playable with Ollama off (phone check-in)? The
   architecture above assumes yes.
6. Prestige carry set: disclosures + post-mortem + playbooks, with or without
   reputation?
7. Does the descent need a mid-run "win" beat (e.g. the flagship renews) so
   a month of losing has a crest in it?
