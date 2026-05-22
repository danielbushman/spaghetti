# spaghetti — Product Brief

**Version:** 1.0 (discovery draft)
**Date:** 2026-05-22
**Phase:** 1 of 5 — Product Brief
**Agent:** Saga (WDS v1.0.0)

---

## Vision

**Mission:** Make the AI-tycoon power fantasy genuinely fun — and let the players who lean in absorb real orchestration intuition, and the discipline not to be wrecked by it, as a byproduct.

**North star:** Fun. If realism or the health goal ever conflict with fun, fun wins.

**The fantasy being served:** "I'm making serious money having AI do the work for me." Universal resonance right now — from players who have never written a line of code to senior agentic engineers. The game gives them the experience of the fantasy before they have to pay for the real thing.

**Realism's role:** Suspension-of-disbelief amplifier, not curriculum. Real industry terms and real AI orchestration patterns make the fantasy feel real. Players who lean in develop transferable skills as a byproduct — not because the game teaches them, but because the domain texture is authentic. Like a high-fidelity flight simulator: the skill transfers without the game announcing itself as training.

**The 90-minute biorhythm:** Encoded in the economy's diminishing-returns curves. Never named, never explained, never preached. The agent may softly hint at natural stopping points. Players discover it through optimization.

---

## The Three Pillars

### Pillar 1 — The Game and Fantasy

An idle game about running an AI company. The player wakes up as an operator in a cockpit: their AI business is already running, a client contract is active, and neither the operator nor their agent remembers what happened. System coming back online. So are they.

**Core emotional target — the walk-away, not the play:**
The player should feel *better* about closing the game than opening it. Pride in stepping away. Confidence in the setup. Anticipation for the next window. The operator who maximizes this game is the one who learns when to leave.

**Diminishing-returns curves (design constraints, not guidelines):**

| Surface | 10% | 80% | 99% | 99.99% |
|---|---|---|---|---|
| Weekday morning | — | 90 seconds | 30 minutes | 60 minutes |
| Weekend session | — | 30 minutes | 90 minutes | 90 min × 4 |

These curves must be produced by the economy's actual math. Not approximated.

**The 90-min through-line:** About once a week the rhythm inverts — long planning sessions (weekend deep play up to 4 × 90 min) set up the automation that runs the rest of the week. The game rewards this cadence mechanically.

**Anti-addiction design — a hard design rule:**
- No streak penalties (daily check-in gift exists; missing costs nothing)
- No energy systems that lock out gameplay
- No loot boxes, no FOMO timers, no compulsion-loop mechanics
- No re-engagement push notifications
- Designed for *avg 4 hrs/wk*. If avg crosses 20 hrs/wk, that is a bug, not a feature.

### Pillar 2 — Real-Tool Simulation

The game uses real AI industry terminology and real agent orchestration concepts because that is what makes the fantasy feel real — not because the player must learn them.

**Model constraint (hard limit):** Local Ollama only. No paid APIs, ever. The game simulates big-model behavior using local models (Gemma-class is sufficient — it needs to sound smart enough to write code, not to actually write production code).

**Skill ceiling:** The hypothetical #1 player would be meaningfully prepared to manage a real AI coding project — having internalized rate-limit budgeting, agent coordination, resource allocation, and attention/time discipline. This is not marketed; it is a natural consequence of authentic domain texture.

**What "real" means and does not mean:**
- Real: terms, concepts, agent relationship dynamics, operational patterns, rate-limit structures
- Not real: the AI actually writing code, the tokens actually being spent, the "big" models actually being called
- The line: *"the game world is simulated; the graduation surface is real"*

### Pillar 3 — The Open Data Layer

The player can access their own game data: resource values, cooldown timings, upgrade costs and trees, progress rates (raw enough to compute metrics, not pre-computed for them). This data is:

- **Exportable to spreadsheet**
- **Accessible programmatically** — designed so a player can point their own Claude/ChatGPT at the data
- **CLI-accessible** (companion CLI planned — not MVP)
- **Curated, not exhaustive** — raw data that rewards analysis, not isolated metric values that do the analysis

**This is explicitly not cheating. It is good play.**

This surface is where the game world and the real world touch. The player uses a real AI agent to optimize a simulated AI business. The skill of "give an AI agent access to data and have it help you make decisions" is the same skill in both contexts. The graduation happens naturally, without announcement.

No competitor in the AI-tycoon idle niche offers this. It is the most defensible moat.

---

## Positioning

**Primary hook:** *"Play the AI tycoon fantasy before paying for it."*

**The insight:** Every persona is adjacent to the AI economy and feels the FOMO. The wall between them and the real thing is some combination of money, product vision, and skill. The game removes all three walls simultaneously: no real money required, no product idea required, no coding background required.

**Competitive positioning:**
- vs. existing AI idle games (8+ titles, all Cookie Clicker formula with AI flavor): real-tool texture, open data layer, health-first design. None of them do any of these three.
- vs. real AI tools (Claude Code, Codex): no token bill, no prerequisite product vision or skill, no failure risk
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
**What the game gives:** The fantasy at allowance prices. First taste of "I built this and it runs while I sleep."

### Jordan — 22yo, Junior Dev

**Day before:** Grinding LeetCode, watching senior engineers use AI to ship 10× faster, feeling like AI is leaving them behind. Could spend on real tokens but can't justify it without a product idea.

**What they have:** Basic coding skills, technical curiosity.
**What they lack:** Product vision, tycoon courage, budget confidence.
**What the game gives:** Orchestration pattern recognition, cheap practice managing AI agents, intuition for what's worth building.

### Sam — 34yo, Senior Agentic Engineer

**Day before:** At his enterprise job, using real AI orchestration tools for his employer's benefit, dreaming about applying these skills to something that benefits him directly. Can't justify $200/mo on Claude Code without a product idea to justify it.

**What they have:** Deep technical chops, real AI ops experience.
**What they lack:** Product vision, conviction to spend $200/mo on themselves.
**What the game gives:** A sandbox to find a product idea, permission to play with the skill outside the day job, a community of people doing the same.

**Sam's session pattern (design reference):**
- 90-second check-in: collect resources or spend auto-collected on day-aligned upgrades. Feeling: smart, in control, "I picked the best move in 90 seconds."
- 5–10 min morning: tune the day's automation setup. Feeling: productive, confident, "it'll run without me."
- Weekend 90-min session: real optimization toward the goal he's saving for. Feeling: mastermind.
- Walk-away: better than opening. Pride. Trust in the setup. Anticipation for tomorrow.
- Overnight return: wakes to $100 / $1k / $1M earned while sleeping. Bliss.

### Riley — 38yo, Stratechery PM

**Day before:** Reading Stratechery, thinking about the AI market from an operator/strategist lens, has never shipped a product, wants to feel the tycoon experience without the risk.

**What they have:** Business intuition, capital instincts, strategic thinking.
**What they lack:** Code, the ability to ship.
**What the game gives:** Operator-mode embodiment of the strategy they already think about.

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
| **Build stack** | Browser (d3-rendered fake TUI, `browser-version` branch). Dev surface, not final platform. Port strategy is low-friction — maker recently ported a JS library to Rust via prompt loops. |
| **AI models** | **Local Ollama only. Hard limit.** No paid APIs. Gemma-class sufficient. Simulating big models, not calling them. |
| **Team** | Solo. Claude Max for AI-assisted development. Few hours/week of human time, heavily multiplied by autonomous AI work against good specs. |
| **Timeline** | Soft: 6 months. Hard: 12 months. Market-timing-sensitive (AI fantasy buzz is a now-or-close window). |
| **Audience floor** | 13+. No COPPA/minor-specific compliance burden. |
| **Age rating target** | E10+ / T. The awakening fiction ("fragile contract, system down") is appropriate for this range. Confirm as fiction expands. |
| **Distribution / payment processing** | Deferred. See Business Model note. |

**Architectural principle (non-negotiable):** *"The game world is simulated; the graduation surface is real."* Ollama runs in-game. The player's own real AI tools access the data layer. Two clean worlds, separated by the save-file boundary.

---

## Open Questions (for future phases)

- Specific dollar values for tiered IAP caps (playtesting-dependent)
- Final build platform (browser PWA, Electron wrapper, native — defer to post-MVP)
- Distribution platform (Steam, itch.io, App Store, direct — defer to closer to launch)
- In-game economy design: what resources exist, their rates, how they map to real AI ops concepts
- Research: evidence-based literature on healthy gaming hours/week — needed before mechanics finalize
- Payment gate flavor: does the "complete game" unlock have in-fiction framing or is it a naked paywall? (Lean: naked clarity per maker's trust-first stance)
- `docs/C-UX-Scenarios/` — Freya's work
- `docs/E-Development/000-PRD.md` — Saga + Mimir
