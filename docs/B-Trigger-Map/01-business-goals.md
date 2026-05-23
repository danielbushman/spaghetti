# Business Goals — spaghetti

> Phase 2 — Trigger Mapping · Workshop 1
> Source: `docs/A-Product-Brief/product-brief.md` · Workshop date: 2026-05-22
> Status: Draft — pending review

---

## Vision

*spaghetti is the AI-tycoon idle game that makes the genre honest — designed to be walked away from, designed to be optimized with the player's own real AI tools. It makes the AI-tycoon fantasy feel like a real skill, transferably, without ever announcing itself as training.*

---

## Strategic Goals

### Goal 1 — The Walk-Away Loop

*Ship a core gameplay loop that is genuinely fun on its own merits — proven by players feeling better when they close the game than when they opened it — with average session weight landing inside the 4-hrs/wk health envelope by design, not by friction.*

| # | Objective | Target |
|---|-----------|--------|
| 1.1 | By end of closed beta, median weekly **play-mode** session time lands in a healthy band; tail of over-engaged play-mode players stays small. **Study-mode time is tracked separately and treated as a positive signal — see Two-Mode Time Accounting below.** Measured via in-game telemetry. | Median **2–6 hrs/wk play-mode**; **<5%** of active players exceed **20 hrs/wk play-mode** in any rolling 30-day window. Beta target: **month 9**. |
| 1.2 | By end of closed beta, an in-game session-close micro-survey (≤2 questions) measures the walk-away feeling directly. | **≥70%** of session-end events tagged *"better"* (vs. *"neutral"* or *"worse"*). Survey deployed from beta start. |
| 1.3 | By launch, D30 retention reaches a healthy floor *without* any compulsion mechanic — verified by a code-audit checklist published openly with the launch announcement. | **D30 retention ≥30%** across cohorts, with **zero** streak penalties, energy lockouts, FOMO timers, loot boxes, or re-engagement push notifications in the codebase. |

---

### Goal 2 — The Honest Economy

*Build an in-game economy whose actual math produces the published diminishing-returns curves — so the 4-hrs/wk health envelope is enforced by mechanics, not by policy, and no compulsion device is ever needed to hit retention targets. This is the load-bearing prerequisite for Goal 1.*

| # | Objective | Target |
|---|-----------|--------|
| 2.1 | By alpha, the published diminishing-returns curves are achieved by the economy's actual math — not by force-fitting in-engine. | Measured playtester session-utility data matches the published curves (90s / 30min / 60min weekday; 30min / 90min / 4×90min weekend) **within ±15%**, with **no in-engine adjustments** to force the fit. Alpha target: **month 6**. |
| 2.2 | By launch, the economy specification is published publicly with each curve point's mathematical derivation. | Specification reproducible by a motivated external reader (player or critic). Published **at launch**. |
| 2.3 | By launch, an audit confirms the codebase contains zero implementations of compulsion mechanics. | **Zero** instances of: streak penalties, energy systems, FOMO timers, loot boxes, re-engagement push notifications, daily login penalties, limited-time-only mechanics. Audit checklist + result published openly **at launch**. |

---

### Goal 3 — The Open Data Layer

*Ship the open data layer in a form that genuinely lets players point their own AI agents at their save — so the line between playing the game and doing real AI ops dissolves by design. This is the prerequisite for the vision's transferability promise and the game's #1 strategic moat.*

| # | Objective | Target |
|---|-----------|--------|
| 3.1 | By launch, complete game state is exportable in a documented machine-readable format, and verified end-to-end with a real AI agent. | All resources, cooldowns, upgrade trees, progress rates exportable as **CSV + JSON** (schema versioned). At least **one end-to-end test** demonstrates a player pointing Claude/ChatGPT at their export and receiving useful optimization advice. Shipped **at launch**. |
| 3.2 | By month 6 post-launch, the graduation signal shows up in the wild — verified players publicly sharing AI-optimization content. | **≥25 verified public instances** of *"I used [AI tool] to optimize my spaghetti run"* (Reddit, Twitter, YouTube, Discord). Tracked via brand monitoring + manual log. Measured at **month 6 post-launch**. |
| 3.3 | By month 12 post-launch, the data layer has invited externally-built tooling — proof it is curated raw enough to reward analysis. | **≥1 externally-built community tool** uses the data layer (spreadsheet template, MCP server, optimization bot, or similar). Measured at **month 12 post-launch**. |

---

## Two-Mode Time Accounting

spaghetti's health envelope (Goal 1) applies to **play mode** only — not to **study mode**. This distinction is load-bearing for both Goal 1 (the envelope must not penalize learning) and Goal 3 (the Open Data Layer IS the study surface).

| Mode | Definition | Envelope status |
|---|---|---|
| **Play** | In-game actions, watching automations run, decisions inside the running game. The *consumption* surface. | **Bounded** by Goal 1 (2–6 hrs/wk median; <5% > 20 hrs/wk). |
| **Study** | Reading docs and code, tinkering with the system, examining exports, querying external AIs with save data, reading other players' published setups, planning strategy. The *production* surface. | **Unbounded** (with sanity caps for genuine obsession). Tracked separately. Treated as a **positive** telemetry signal. |
| **Application** | Study brought back into play — sharper play per hour, enabled by study. | Counts as play time, but the *ratio* of study-hours-to-effective-play-hours is the design's **success state**, not a failure mode. |

**Design implications carried into Workshop 5 (Feature Impact):**

- Telemetry distinguishes modes from day one.
- UI signals which mode the player is in (without naming the distinction in diet-app vocabulary — design constraint inherited from Brief).
- Design avoids Goodhart manipulation of the boundary (players cannot relabel play as study or vice versa).
- Study-mode obsessive-use nudges are **forbidden** — they would break the design's promise to apprentice-pattern players (e.g., a *"you've been at this too long"* nudge appearing while reading documentation would be design failure at the conceptual root).

**Surfaced by:** Workshop 3 (Persona — Jordan the Journeyman). The conflation would have penalized the apprenticeship arc spaghetti exists to enable.

---

## Sourcing notes

Every number above derives from a stated commitment in the Product Brief:

- **Hrs/wk targets (1.1)** — Brief Success Criteria: *"4 hrs/wk = nailed it. 6 = happy. 20 = course-correct."*
- **Walk-away feeling (1.2)** — Brief Pillar 1: *"The player should feel **better** about closing the game than opening it."*
- **Anti-addiction list (1.3, 2.3)** — Brief Pillar 1: explicit "hard design rule" list reproduced verbatim
- **Curve table (2.1)** — Brief Pillar 1 diminishing-returns table; the *"must be produced by the economy's actual math. Not approximated."* commitment
- **Open derivation (2.2)** — Brief trust-first stance; implied by the no-anchoring framing of the IAP caps
- **Data layer exports (3.1)** — Brief Pillar 3: *"Exportable to spreadsheet · Accessible programmatically · CLI-accessible (companion CLI planned — not MVP)"*
- **Graduation signal (3.2)** — Brief Success Criteria: *"I used Claude to optimize my spaghetti run = slam-dunk."*
- **Curated-raw data (3.3)** — Brief Pillar 3: *"curated, not exhaustive — raw data that rewards analysis"*

Numeric thresholds introduced by Saga (not in the Brief), open to revision in later iteration:
- **1.2** — 70% walk-away rating (best-guess "good signal" level)
- **3.2** — 25 verified graduation-content instances at month 6
- **3.3** — 1 externally-built tool by month 12

---

*Produced by Saga (WDS v1.0.0) — 2026-05-22*
*Source: `docs/A-Product-Brief/product-brief.md`, Workshop 1*
