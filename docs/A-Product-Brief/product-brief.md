# spaghetti — Product Brief

**Version:** 1.1 (pivot amendment)
**Date:** 2026-05-22 · amended 2026-09-15
**Phase:** 1 of 5 — Product Brief
**Agent:** Saga (WDS v1.0.0) · amended by the maker with Claude

> **v1.1 amendment (2026-09-15).** The game pivoted from a chat cockpit with a
> handful of agents to an **enterprise admin console** for a Quickbase-scale
> AI company, with a **V-shaped** progression (start rich and burning, learn
> the system or go bankrupt, bankruptcy is prestige). Design detail lives in
> `docs/D-Design-Exploration/01-v-shape-prestige.md`. This Brief is amended in
> place; sections that changed are marked **(v1.1)**. The health commitments
> are unchanged in substance but re-ranked: they are constraints on what
> ships, not the generator of the design. Fun is.

---

## Vision

**Mission:** Make the AI-tycoon power fantasy genuinely fun — and let the players who lean in absorb real orchestration intuition, and the discipline not to be wrecked by it, as a byproduct.

**North star:** Fun. If realism or the health goal ever conflict with fun, fun wins. **(v1.1)** This now applies to the design process too: find the fun first; apply the health rules as fit and finish on what ships.

**The fantasy being served (v1.1):** *"I'm running a billion-dollar AI company, and I can see all of it from here."* Universal resonance right now — from players who have never written a line of code to senior agentic engineers. The game gives them the seat before they have to earn it.

**Realism's role (v1.1):** Realism of *vocabulary*, not of *simulation*. Real industry terms and real orchestration concepts make the fantasy feel real; a term never lies. The simulation behind each term is as simple as fun allows. Players who lean in develop transferable intuition as a byproduct — not because the game teaches them, but because the domain texture is authentic. A high-fidelity flight simulator with a simplified weather model.

**The 90-minute biorhythm:** Encoded in the economy's diminishing-returns curves. Never named, never explained, never preached. Players discover it through optimization.

---

## The Three Pillars

### Pillar 1 — The Game and Fantasy (v1.1)

An idle game about running an AI enterprise the size of Quickbase. The player
co-founded **Spaghetti Systems** with a partner who built and ran the system —
the fleets, the routing, the dashboards, the naming — and who is now gone. The
player logs into that partner's console for the first time as its operator,
with six months of runway and a company that burns more than it earns.

**The console is the game.** Mastery is knowing which screen, which filter,
which drill-down finds the bleed. Screens are rooms; drill-downs are doors;
knowing the map is knowing the system. One decision per screen: more rooms
than a real console, fewer choices in each, so the information architecture is
chosen by fun rather than by enterprise realism.

**The V-shape.** Start rich and burning. The slope of the cash curve is the
score, and the slope is what the player can change today. Bend it to profit
and the run is won. Hit zero first and the company folds — bankruptcy is a
ceremony (a blameless post-mortem) and a restart with what the player learned
and wrote down. Not a fail screen.

**The one loop:** notice → investigate → act → wait → verify. A novice takes
twenty minutes per cycle; an expert takes ninety seconds. Compressing that loop
over about a month of play is the progression.

**Core emotional target — the walk-away, not the play:**
The player should feel *better* about closing the game than opening it. In the
V-shape that pride comes from the slope ("that bought four days"), from a
system configured to run unattended, and from anticipation of tomorrow's
signal. The operator who maximizes this game is the one who learns when to
leave.

**Diminishing-returns curves (design constraints, not guidelines):**

| Surface | 10% | 80% | 99% | 99.99% |
|---|---|---|---|---|
| Weekday morning | — | 90 seconds | 30 minutes | 60 minutes |
| Weekend session | — | 30 minutes | 90 minutes | 90 min × 4 |

These curves must be produced by the economy's actual math. Not approximated.
**(v1.1)** They are to be re-derived for the V-shape economy; the session
shape they describe (sharp move / tune / deep investigation) still holds.

**The 90-min through-line:** About once a week the rhythm inverts — long
investigation sessions (weekend deep play up to 4 × 90 min) set up the
policies and dashboards that run the rest of the week. The game rewards this
cadence mechanically.

**Health rules — hard constraints on what ships (v1.1 re-ranked, not weakened):**
- No streak penalties (daily check-in gift exists; missing costs nothing)
- No energy systems that lock out gameplay; bankruptcy is an instant restart
- No loot boxes, no FOMO timers, no compulsion-loop mechanics
- No re-engagement push notifications
- Designed for *avg 4 hrs/wk* play mode. If avg crosses 20 hrs/wk, that is a bug, not a feature.
- Absence is never punished *extra*: the business runs at the rate the player's configuration dictates, and configuring for absence is itself a lever the player learns.

### Pillar 2 — Real-Tool Simulation (v1.1)

The game uses real AI industry terminology and real orchestration concepts because that is what makes the fantasy feel real — not because the player must learn them.

**Fidelity rule:** *realism of vocabulary, not of simulation.* p99, token budget, rate limit, fleet, workload, routing policy, spend anomaly, error budget, retry storm, cache hit rate, SLA — all real, all meaning what they mean in the industry. The math behind them is aggregate (fleets as populations, tokens as rates) and simplified until the loop is fun.

**Model constraint (hard limit):** Local Ollama only. No paid APIs, ever. **(v1.1)** The LLM is flavor, not authority: it narrates and hints (runbooks, post-mortems, an optional limited copilot) and never decides outcomes. The game must be fully playable with Ollama unreachable.

**Skill ceiling:** The hypothetical #1 player would be meaningfully prepared to run cost and reliability for a real AI product — having internalized token budgeting, model tiering, error budgets, routing, observability, and attention/time discipline. Not marketed; a natural consequence of authentic texture.

**What "real" means and does not mean:**
- Real: terms, concepts, the shape of the levers, the shape of the console
- Not real: the AI actually doing the work, the tokens actually being spent, the "big" models actually being called, the full fidelity of an enterprise console
- The line: *"the game world is simulated; the graduation surface is real"*

### Pillar 3 — The Open Data Layer

The player can access their own game data: resource values, cooldown timings, upgrade costs and trees, progress rates (raw enough to compute metrics, not pre-computed for them). This data is:

- **Exportable to spreadsheet**
- **Accessible programmatically** — designed so a player can point their own Claude/ChatGPT at the data
- **CLI-accessible** (companion CLI planned — not MVP)
- **Curated, not exhaustive** — raw data that rewards analysis, not isolated metric values that do the analysis

**(v1.1)** The data layer is now structural: the simulation is event-sourced, so export is the event log plus a state snapshot. The bankruptcy post-mortem and the player's saved dashboards are its first artifacts and carry across prestige.

**This is explicitly not cheating. It is good play.**

This surface is where the game world and the real world touch. The player uses a real AI agent to optimize a simulated AI business. The skill of "give an AI agent access to data and have it help you make decisions" is the same skill in both contexts. The graduation happens naturally, without announcement.

No competitor in the AI-tycoon idle niche offers this. It is the most defensible moat.

---

## Positioning

**Primary hook (v1.1):** *"Run the billion-dollar AI company before anyone gives you one."*

**The insight:** Every persona is adjacent to the AI economy and feels the FOMO. The wall between them and the real thing is some combination of money, product vision, and skill. The game removes all three walls simultaneously: no real money required, no product idea required, no coding background required.

**Competitive positioning:**
- vs. existing AI idle games (8+ titles, all Cookie Clicker formula with AI flavor): real-tool texture, open data layer, health-first design, and a console you actually learn. None of them do any of these.
- vs. real AI tools (Claude Code, Codex, cloud consoles): no token bill, no prerequisite product or skill, no failure risk
- vs. YouTube AI hype content (the actual attention competitor): the fantasy embodied and interactive, not just described

**Unfair-advantage hierarchy:**

| Rank | Moat | Why competitors can't copy it |
|---|---|---|
| 1 | Open Data Layer | Technically novel, anti-engagement-loop, no precedent in genre |
| 2 | Health-first economy | F2P-IAP business model cannot adopt this without destroying its revenue model |
| 3 | Real-tool simulation | Requires genuine agentic engineering domain expertise |
| 4 | Narrative craft | Idle-clicker studios don't hire writers or have this narrative frame |
| 5 | F2P + IAP-light with hard cap | Requires business-model courage; competitors are structurally incentivized against it |

---

## Target Users

### Kai — 13yo, Curious Kid

**Day before discovering spaghetti:** Watching YouTube videos about AI, imagining using it to build something, frustrated that every interesting tool costs money they don't have.

**What they have:** Imagination, time, parental WiFi.
**What they lack:** Money, agency, any path to the real thing.
**What the game gives:** The seat at allowance prices. First taste of "I run this and it runs while I sleep."

### Jordan — 22yo, Junior Dev

**Day before:** Grinding LeetCode, watching senior engineers use AI to ship 10× faster, feeling like AI is leaving them behind. Could spend on real tokens but can't justify it without a product idea.

**What they have:** Basic coding skills, technical curiosity.
**What they lack:** Product vision, tycoon courage, budget confidence.
**What the game gives:** Pattern recognition for cost and reliability at scale, cheap practice reading a system someone else built, intuition for what's worth building.

### Sam — 34yo, Senior Agentic Engineer

**Day before:** At his enterprise job, using real AI orchestration tools for his employer's benefit, dreaming about applying these skills to something that benefits him directly. Can't justify $200/mo on Claude Code without a product idea to justify it.

**What they have:** Deep technical chops, real AI ops experience.
**What they lack:** Product vision, conviction to spend $200/mo on themselves.
**What the game gives:** A sandbox to find a product idea, permission to play with the skill outside the day job, a community of people doing the same.

**Sam's session pattern (design reference, v1.1):**
- 90-second check-in: Overview, one anomaly, one policy change. Feeling: smart, in control, "I picked the best move in 90 seconds."
- 5–10 min morning: tune budgets, alerts and routing for the day. Feeling: productive, confident, "it'll run without me."
- Weekend 90-min session: deep investigation in Spend Explorer, compose the dashboard that shows the next bleed. Feeling: mastermind.
- Walk-away: better than opening. Pride. Trust in the setup. Anticipation for tomorrow.
- Overnight return: the sparkline moved the way he predicted. Bliss.

### Riley — 38yo, Stratechery PM

**Day before:** Reading Stratechery, thinking about the AI market from an operator/strategist lens, has never shipped a product, wants to feel the tycoon experience without the risk.

**What they have:** Business intuition, capital instincts, strategic thinking.
**What they lack:** Code, the ability to ship.
**What the game gives:** Operator-mode embodiment of the strategy they already think about. **(v1.1)** Riley is now closer to the protagonist than anyone: the business co-founder handed the builder's console.

### The Pocket-Fantasy Player (archetype, any age)

Plays for years. Never intends to "graduate" to real AI work. The fantasy is the point — *"I could do that if I wanted to"* — like a pet vet who loves feeling like they could be an AI tycoon if they chose to. This is an equally valid and successful outcome. Retention without graduation is healthy retention if hours/week stays in range.

---

## Business Model

**Structure:** Free-to-play. Optional time-skip IAP. No ads. No other IAP categories.

**IAP design:**
- **Time-skips only** — money buys you out of waits. Never out of mechanics, never out of content, never into advantage. "Good play" looks identical for paying and non-paying players.
- **Tiered caps modeled on real AI tool rate limits:**
  - 5-hour session cap: ~$40 (rolling) — mirrors Claude/Codex per-session rate limiting
  - Weekly cap: ~$80 (rolling) — mirrors weekly token ceiling on consumer AI plans
  - Monthly cap: $200 (hard, calendar month) — mirrors the cost of high-end consumer AI subscriptions
- **Specific values TBD via playtesting.** The structure is locked; the numbers are not.
- **The caps are documented (FAQ, trust page) but not headlined.** No anchoring on "won't let you spend more than $200." That's a quiet structural commitment, not a marketing message.
- **The cap structure is in-game fiction, not just a spending policy.** Players experience rate-limit budgeting as a simulation of real AI tool ops. The IAP economy teaches the graduation skill through the wallet.

**Daily check-in gift:** Yes. Missing a day costs nothing. No streaks, no penalties. Creates habit anchor; does not create dread.

**Free play is the canonical experience.** The economy must be balanced for the non-paying player first. IAP sits on top as a comfort layer.

**Marketing framing:** *"One game. Optional time-skips. No ads. No tricks."*

**Platform and payment processing:** Deferred decision. Note: platform choice swings net revenue by ~30% (Steam/Apple = 70% net; direct/web = ~97% net). Cap enforcement architecture varies by platform — self-hosted web gives full control; App Store IAP has behavioral constraints. Decide when closer to launch.

---

## Success Criteria

| Metric | Target | Notes |
|---|---|---|
| **Conversion rate** | Optimize | Primary signal that the core loop is engaging; also funds development |
| **Avg hrs/wk per active player** | **4 hrs/wk = nailed it** | 6 = happy. 20 = course-correct. This is a health metric, not a vanity metric. |
| **Graduation signal** | Bonus, not required | "I used Claude to optimize my spaghetti run" = slam-dunk. Never at the expense of non-graduating players. |
| **Revenue** | $100k = worth the time | Floor: measurable positive impact + no addicts = still worth it (barely). Gut ceiling: $10M (market timing dependent). |
| **No-addict floor** | Measured, not assumed | Average hrs/wk is the primary instrument. Research flag: find evidence-based literature on healthy gaming hours/week before mechanics are finalized. |

---

## Constraints

| Constraint | Status |
|---|---|
| **Build stack (v1.1)** | Browser console: Bun server + Svelte 5 client, deterministic TypeScript simulation, event-sourced persistence. The chat cockpit and the Python Textual TUI are retired; the intro sequence, motion library, signal row and speed slider carry over. Dev surface, not final platform. |
| **AI models** | **Local Ollama only. Hard limit.** No paid APIs. Gemma-class sufficient. Flavor, never authority; playable with Ollama off. |
| **Team** | Solo. Claude Max for AI-assisted development. Few hours/week of human time, heavily multiplied by autonomous AI work against good specs. |
| **Timeline** | Soft: 6 months. Hard: 12 months. Market-timing-sensitive (AI fantasy buzz is a now-or-close window). **(v1.1)** Clock restarts from the pivot date for planning purposes. |
| **Audience floor** | 13+. No COPPA/minor-specific compliance burden. |
| **Age rating target** | E10+ / T. The fiction ("your co-founder is gone, the company is burning") is appropriate for this range. Confirm as fiction expands. |
| **Accessibility (v1.1)** | Colorblind-safe palettes throughout. The maker cannot distinguish green from amber; no status or chart may depend on hue alone. |
| **Distribution / payment processing** | Deferred. See Business Model note. |

**Architectural principle (non-negotiable):** *"The game world is simulated; the graduation surface is real."* Ollama runs in-game. The player's own real AI tools access the data layer. Two clean worlds, separated by the save-file boundary.

---

## Open Questions (for future phases)

- Specific dollar values for tiered IAP caps (playtesting-dependent)
- Final build platform (browser PWA, Electron wrapper, native — defer to post-MVP)
- Distribution platform (Steam, itch.io, App Store, direct — defer to closer to launch)
- **(v1.1)** In-game economy design at enterprise scale: fleets, workloads, model tiers, customers, and the aggregate math that produces the V — see the design exploration doc
- **(v1.1)** The co-founder: name, departure, how much of their voice survives
- **(v1.1)** Whether any in-character LLM voice survives (leaning: an optional, deliberately limited copilot the co-founder built)
- **(v1.1)** First-run length (working assumption: about one real month) and the sim-clock mapping (1 real day = 1 sim-week)
- Research: evidence-based literature on healthy gaming hours/week — needed before mechanics finalize
- Payment gate flavor: does the "complete game" unlock have in-fiction framing or is it a naked paywall? (Lean: naked clarity per maker's trust-first stance)
- `docs/C-UX-Scenarios/` — Freya's work
- `docs/E-Development/000-PRD.md` — Saga + Mimir
