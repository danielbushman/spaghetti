# The Pivot — Enterprise Console, V-Shape Progression, Prestige

> Branch: `design/v-shape-prestige` · Started: 2026-09-15 · Revised: 2026-09-15
> Status: **working design document.** Sections marked ⚖ are open decisions.
> Supersedes the game-loop framing in `docs/A-Product-Brief/product-brief.md` v1.0; the Brief is amended to v1.1 alongside this document.

---

## 1. What changed

The pre-pivot game: a chat cockpit, a handful of agents, a warm AI partner
talking you through a reboot. Fun to build. Not fun to play.

The pivot, in one paragraph:

> You co-founded **Spaghetti Systems**, an AI enterprise the size of Quickbase.
> Your co-founder built and ran the system. They are gone. You have the keys
> to their console, six months of runway, and a company that burns more than it
> earns. The console is the game. Learning it well enough to turn the burn into
> profit is the progression. Failing is bankruptcy, and bankruptcy is prestige.

Four commitments follow from that paragraph:

1. **Scale.** Fleets, not agents. Trillions of tokens, not thousands. Policies, budgets and routing, not individual jobs.
2. **The console is the game.** Mastery is knowing which screen, which filter, which drill-down finds the bleed. Not a TUI. A browser console with a slight fantasy edge and a slight casual-game finish.
3. **V-shape.** Start rich and burning. Bend the curve or go bankrupt. Bankruptcy is a ceremony and a restart, not a fail screen.
4. **Fun first.** The health rules from the Brief stay as hard constraints on what ships. They are fit and finish. They are not the generator of the design.

---

## 2. The fiction

**Spaghetti Systems.** Founded by two people. One built the product: the
fleets, the routing, the dashboards, the naming scheme, the half-written
runbooks. The other ran the business: customers, capital, the board. The
builder is gone. Why is lore, and it stays unexplained for a long time. ⚖
(name of the co-founder; nature of the departure)

The player is the business co-founder, logging into the builder's console for
the first time as its operator. Everything in it was made by someone who is not
here to explain it. Progressive disclosure is diegetic: you are reading a gone
person's system.

**Scale reference: Quickbase.** The maker's constant mental comparison. Used as
a size, not as a subject. Approximate reference points, not facts the fiction
depends on: a company that changed hands at roughly a billion-dollar valuation,
revenue in the low hundreds of millions, several hundred employees, thousands of
business customers.

**Proposed opening numbers** ⚖ (tune in play):

| Quantity | Value | Note |
|---|---|---|
| Last valuation | ~$1B | The number the board and the press use |
| ARR | ~$140M | Real money, from real contracts |
| Cash | ~$150M | Runway numerator |
| Net burn | ~$25M / sim-month | Runway ≈ 6 sim-months. Matches the existing `runway: 6 mo` signal |
| Customers | ~5,000 business accounts | Halberd Capital remains a flagship account (existing canon) |
| Fleets | ~40 | Named by the co-founder. Names carry the fantasy edge |
| Concurrent agents | tens of thousands | Never shown individually. Only as populations |
| Tokens | 2–3 trillion / sim-month | Token spend is the dominant cost of goods |

**What the awakening scene becomes.** First login. Not amnesia: absence. The
console lights up page by page. The signals are already moving. Something is
already wrong. The existing intro beats (lamp warming, sparks, the after-image
purple, "SPAGHETTI") survive nearly unchanged; what follows them changes from a
chat window to a console.

---

## 3. The V-shape

1. **Start rich and burning.** Cash is high. Net cash flow is negative. Runway is the headline signal.
2. **The descent.** Every sim-week you do not understand the system, money leaves. The **slope** is the score, and the slope is what the player can change today. Pride comes from flattening it ("that bought four days"), not from the level.
3. **The inflection.** Enough levers pulled, in the right order, and net cash flow crosses zero. The curve bottoms and climbs. This is the win condition for a run.
4. **Bankruptcy → prestige.** Cash hits zero before the inflection: the company folds. A new company starts. See §7 for what carries.

The descent must have a crest in it ⚖: a mid-run win beat (a flagship renewal,
a fleet that finally turns profitable) so a month of losing is not a month of
losing. Candidates in §9.

---

## 4. The console

### 4.1 Feel target

- **Grafana more than AWS.** Time-series panels. Dashboards the player composes. A time picker on everything. Composing your own dashboard is an expert move and a saved artifact.
- **Some of Linear's simplicity.** Keyboard-first. Few controls per screen. Crisp hierarchy. A command palette (⌘K) to jump between screens.
- **Slight fantasy edge.** Lives in naming and lore (fleet names, the co-founder's leftover labels), not in UI chrome.
- **Slight casual-game aesthetic.** Rounded, readable, generous spacing. Cleanliness of a Two Point Hospital menu, not the density of a Bloomberg terminal.
- **Colorblind-safe from day one.** The maker cannot distinguish green from amber. Every chart palette and every status color must be distinguishable without hue.

### 4.2 Information-architecture principle: one decision per screen

A real enterprise console packs twenty decisions into two dense screens. Ours
spreads the same ground across ten screens with two decisions each. The ratio is
a feel, not a rule. Consequences:

- **Navigation is the mastery.** Screens are rooms. Drill-downs are doors. Knowing the map is knowing the system. A novice wanders; an expert teleports.
- **Each screen is cheap to build and cheap to cut.** Good for iteration.
- **Room test.** A screen earns its place only if it offers a *discovery* or a *lever*. No discovery, no lever: cut it.

### 4.3 Realism of vocabulary, not of simulation

Real terms only: p99, token budget, rate limit, fleet, workload, routing
policy, spend anomaly, error budget, retry storm, context window, cache hit
rate, SLA. **A term never lies.** The simulation behind the term is as simple
as fun allows. Fidelity floor: the term means what it means in the industry.
Fidelity ceiling: whatever keeps the loop fun.

### 4.4 Screen inventory (first draft) ⚖

| Screen | Discovery it offers | Lever it holds |
|---|---|---|
| **Overview** | Runway, slope, the four headline signals, active incidents | None. It is the place you leave from |
| **Fleets** | Which fleets cost the most, earn the most, error the most | Pause / scale a fleet |
| **Fleet detail** | Its workloads, its model mix, its token curve, its co-founder notes | Assign routing policy, set concurrency |
| **Workloads** | What the fleets are actually doing, job sizes, completion rates | Reprioritize, throttle |
| **Models & Routing** | Which model tier handles which workload; where a frontier model does trivial work | Routing rules (the biggest lever in the game) |
| **Token Budgets** | Spend per fleet against budget; who is over | Caps, alerts |
| **Spend Explorer** | Group-by anything: fleet, model, customer, workload, region. The Cost Explorer moment | None directly; it points at the lever |
| **Incidents** | Retry storms, queue backups, SLA breaches, and what they cost | Acknowledge, runbook, circuit-break |
| **Customers & Contracts** | Which accounts are profitable; renewal dates; SLA terms | Renegotiate, drop, upsell |
| **Billing & Runway** | The V itself, projected forward | None. The scoreboard |
| **Audit Log** | Every change, by whom, when. The co-founder's last changes are here | None. Evidence |
| **Runbooks** | The co-founder's notes, half-finished. Lore and hints | Apply a runbook |
| **Saved Views / Dashboards** | The player's own composed views | Persisted across prestige (§7) |
| **Command palette** | Jump anywhere by name | Speed. The visible form of mastery |

Fourteen rooms. Expect to cut some and split others once played.

### 4.5 The one loop, at every scale

**notice → investigate → act → wait → verify.**

The SRE loop. Month-one novice: twenty minutes per cycle, wandering. Expert:
ninety seconds, teleporting. Compressing that loop over a month *is* the
progression, and it is also exactly the Brief's "90-second sharp move".

---

## 5. What the player learns (the lever set)

Each item is a real ops concept, a discovery on some screen, and a lever on
burn. Ordered roughly by how early a player is likely to find it.

1. **Where the money goes.** Spend Explorer, group by fleet. First discovery: *you can see it now.*
2. **Model tiering.** A frontier model doing 40-token jobs. Route cheap work to cheap models.
3. **Retry storms / error budgets.** Errors cost twice. Backoff and circuit breakers.
4. **Idle compute.** Fleets running with empty queues. Scale-to-zero, schedules.
5. **Context bloat.** Prompts growing every cycle. Caching, trimming, cache hit rate.
6. **Fan-out.** One request becomes twelve calls. Batching, planning.
7. **Contract economics.** Which customers are profitable; what an SLA actually costs to honor.
8. **Budgets and alerts.** Stop finding problems by hand; make the console find them.
9. **Unattended profiles.** What the system does while you are away. The walk-away configuration.
10. **Composed dashboards.** Build the view that shows the next bleed before it happens.

---

## 6. Time

**Working assumption: about one real month for run 1.** Long enough to feel
loss; short enough that the first bankruptcy is a rite, not an ending. A week
is too shallow to learn a fourteen-room console; three months makes the first
bankruptcy read as betrayal.

**Sim clock (proposal):** 1 real day = 1 sim-week. Six sim-months of runway ≈
26 real days. Economy math lives in sim time; one constant maps it to wall
time; the existing speed slider scales that constant for development.

**Waiting is for signal.** In real ops you change a routing rule and wait for
enough traffic to know whether it helped. That is the honest form of the idle
wait: change a policy, come back tomorrow, read the sparkline. The number goes
down in run 1; the data goes up. The existing A/B compare becomes a player tool.

---

## 7. Prestige: what carries

Principle: **you keep what you learned and what you wrote down.**

| Carries | Why |
|---|---|
| **Screens stay unlocked.** Rooms you found stay on the map. | Disclosure carried forward structurally. Run 2 starts with more of the console lit |
| **The post-mortem.** A blameless post-mortem written at bankruptcy: what burned the money, in order. | The prestige ceremony is a real ops ritual. First Open Data Layer artifact |
| **Saved views and dashboards.** | The player's own composed instruments |
| **Playbooks.** Routing rules, budgets, alert configs the player chose to save. | The exported save is the prestige currency. Ties the data layer into the core loop |
| **Reputation** ⚖ | Affects seed round and customer trust in the next run. Narrative weight only; never an exponential multiplier |

Does not carry: cash, customers, fleets, the co-founder's console as-is.
Fiction: the company folds; a new one starts. Every run opens with a first
login.

---

## 8. Architecture

Goals: deterministic, headless-testable, replayable, exportable by
construction, playable with Ollama off.

```
sim/          pure TS. step(state, dtSim, config, rng) → state. No DOM, no IO.
              Aggregate model: fleets × workloads × models × customers as
              rates, queues and distributions. No per-agent entities.
events/       append-only log of player actions + periodic checkpoints.
              Source of truth. JSONL (chat-log.ts already has the shape).
persistence/  Bun SQLite. runs table; each run has an event log and a
              carried-artifacts blob (§7).
narrator/     Optional. Ollama reads state, never writes it. Runbook voice,
              post-mortems, the co-founder's leftover copilot (⚖ see §9).
console/      Svelte. Screens over sim state. The existing motion library and
              intro beats bolt on.
export/       state JSON + events JSONL + schema version. Companion CLI later.
```

Decisions:

- **Aggregate simulation.** Swarm scale costs nothing to simulate when agents are populations. Trillions of tokens are just numbers in a rate. This is easier than the per-agent sim and produces exactly the views a console shows.
- **Offline progress** by deterministic catch-up on load. Coarse ticks for long gaps. No server-side ticking required.
- **The LLM is flavor, not authority.** The game is fully playable from a phone with Ollama unreachable.
- **Event sourcing** gives export, replay for balancing, the post-mortem, telemetry, and A/B compare.
- **What survives from the current code:** intro sequence and motion library, signal row and sparklines, speed slider, chat-log persistence pattern, Bun server + Svelte plugin. The random-walk telemetry is replaced by sim output. The chat cockpit and the Python TUI are retired.

---

## 9. Open decisions ⚖

1. **Co-founder:** name; nature of the departure; how much of their voice survives in runbooks and labels.
2. **In-character LLM voice:** does one survive at all? Options: (a) none, the console speaks only through data and the co-founder's notes; (b) a deliberately limited ops copilot the co-founder built, running on the local model. Recommendation: (b), optional at runtime, never load-bearing.
3. **Run 1 designed to be lost,** or winnable by a sharp first-timer? Sets disclosure difficulty.
4. **Absence:** literal burn while away, or an unattended profile the player configures? Recommendation: unattended profile; learning to leave well is a lever (§5 item 9).
5. **Mid-run crest:** flagship renewal, first profitable fleet, or a board meeting beat.
6. **Reputation carry:** in or out.
7. **First slice to build:** Overview + Spend Explorer + one hidden bleed, behind the existing intro. Question it answers: does finding the bleed by drill-down feel like delight?
