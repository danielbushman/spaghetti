# spaghetti — WDS Design Log

---

## Phase Status

| Phase | Agent | Status |
|---|---|---|
| 1. Product Brief | Saga | ✓ complete |
| 2. Trigger Map | Saga | ⏳ in-progress (Workshops 1–3 done + W1 amended; W4–5 pending) |
| 3. UX Scenarios | Freya | ○ not started |
| 4. UX Design | Freya | ○ not started |
| 5. Development | Mimir | ○ not started |

---

## Current

**Phase 2 — Trigger Map** · Workshops 1–3 complete (Business Goals + Sam the Side-Project Seeker + Jordan the Journeyman) + **W1 amended in-place** with Two-Mode Time Accounting (W3 finding). Next: Workshop 4 (Persona — Kai, 13yo curious kid). Then Workshop 5 (Feature Impact, autonomous) and the poster.
Persona order locked for Workshops 2–4: **Sam → Jordan → Kai**.

---

## Log

### 2026-05-23 — Trigger Map Workshop 3 (Persona — Jordan the Journeyman) complete · Architectural design clarification surfaced

**Session:** Saga, continued /saga session.
**Approach:** Full 5-phase persona sequence (name → profile → driving-forces → usage-context → goal-connection) per `workflows/trigger-map.md`. User crisp on every confirmation. Phase 4 surfaced a substantive user-introduced architectural clarification mid-draft (see *Two-Mode Time Accounting* below); integrated immediately with back-edit to Workshop 1. Document produced via **spawned general-purpose Agent acting as persona-writer subagent** (pattern continued from W2).

**Deliverables written:**
- `docs/B-Trigger-Map/03-persona-jordan-the-journeyman.md` (76 lines)
- `docs/B-Trigger-Map/01-business-goals.md` — amended in place (Obj 1.1 wording refined + new "Two-Mode Time Accounting" section)

**Key persona decisions locked:**
- **Archetype name:** *Jordan the Journeyman* (chosen over *Junior Dev* — names what he's *becoming* through practice, not his career stage; extends Sam-naming pattern of identity-over-title).
- **The earnest apprentice** — low ego, high learning curve, treats every session as practice. Classical apprentice-to-master arc; *practice* over *credential*. Rules out impostor-syndrome framing as Jordan's primary.
- **Access, plainly** — his blocker is neither skill nor drive nor direction. Inverts Sam's blocker (Sam: too-much-access / too-little-time. Jordan: lots-of-time / no-access). Reframes spaghetti as **"the apprenticeship he can't be hired into yet."**
- **Canary, not auditor** — Jordan stress-tests the anti-addiction stance *behaviorally* (might not detect violations consciously; would be most harmed by them). Sam audits cognitively; Jordan protects behaviorally. The two together cover the stance from both angles.

**Driving forces (FIA scored):**
- 5 positive: P1 *teach-back click* (14), P5 *apprentice's return* (14), P2 *overnight tutor* (13), P4 *walking past his old self* (13), P3 *export-and-ask-Claude graduation moment* (12).
- 5 negative: N2 *time-stealing without growth* (14), N1 *empty validation / cheap dopamine* (13), N3 *stagnation — apprentice's ceiling* (13), N4 *pretend complexity / cargo-cult realism* (12 at F=3 — revisit if Goal 3 metrics underperform; could push to F=4 / total 13), N5 *sticky-when-graduating* (12).
- Score pattern: **2 positive HIGHs + 1 negative HIGH** — distributed across the apprenticeship arc rather than concentrated on identity-defining moments (Sam's pattern was 4+1, concentrated on identity). Honest reflection of Jordan's secondary-persona role with one critical cross-cutting contribution.

**Goal connections:** Critical for G1 (load-bearing canary; surfaced and defends two-mode distinction), complementary for G2 (test subject not auditor; legible churn signal), critical for G3 (graduation arc embodied; canonical Obj 3.2 poster). **Plus a cross-cutting Two-Mode Accounting load-bearer role** that exceeds per-persona scope.

**Architectural decision: Two-Mode Time Accounting.**
The 4-hrs/wk health envelope (Goal 1) bounds **play mode** (in-game consumption — active actions, watching automations) but **NOT study mode** (reading docs, tinkering with the system, exporting saves, querying external AIs with save data, reading other players' setups, planning strategy). Study mode is **unbounded with sanity caps for genuine obsession**, and study time is a **positive** telemetry signal. Application of study to play (the *"mechanic who knows where to work because she studied it"*) is the design's **success state**.

**Why it matters:** Jordan-as-canary surfaced that conflating modes would literally penalize the apprenticeship arc the design exists to enable. The Brief's transferability commitment lives in study mode; the health envelope lives in play mode; treating them as one metric collapses the distinction the vision depends on. This sharpens Goal 3's strategic positioning: the **Open Data Layer IS the study surface** — Goal 3 becomes the *positive* counterpart to Goal 1's *negative*, encoding "play less, study more, graduate" as a single coherent design philosophy.

**Propagation actions taken this turn:**

- **Workshop 1 back-edit:** `01-business-goals.md` — Obj 1.1 wording refined to "play-mode session time"; new "Two-Mode Time Accounting" section inserted between Goal 3 and Sourcing notes.
- **Workshop 4 (Kai):** distinction carries forward without re-asking. May surface differently for Kai (age 13 — more constrained study capability; different mode-ratio implications worth attention).
- **Workshop 5 (Feature Impact):** mode-separation is now a **load-bearing feature requirement**. Telemetry must distinguish modes from day one; UI signals mode without naming the diet vocabulary; design avoids Goodhart manipulation of the boundary; study-mode obsessive-use nudges are **explicitly forbidden**.

**Pattern note:** First time a persona workshop has surfaced a back-edit to a prior workshop. Pattern lesson: trust the persona work to audit upstream decisions; integrate immediately rather than retrofit.

---

### 2026-05-23 — Trigger Map Workshop 2 (Persona — Sam the Side-Project Seeker) complete

**Session:** Saga, /saga invocation resumed after compaction.
**Approach:** Full 5-phase persona sequence (name → profile → driving-forces → usage-context → goal-connection) per `workflows/trigger-map.md`. User crisp on every confirmation. Document produced via **spawned general-purpose Agent acting as persona-writer subagent** (workflow constraint satisfied — Saga did not write inline this time).

**Deliverables written:**
- `docs/B-Trigger-Map/02-persona-sam-the-side-project-seeker.md`

**Key persona decisions locked:**
- **Archetype name:** *Sam the Side-Project Seeker* (chosen over *Sam the Senior Agentic Engineer* — names what he's *seeking*, not his title, which is more characterful and persona-defining).
- **Quiet success, not escape** — Sam's day job is genuinely fine. He's not running away; he's running toward a feeling he's never had (his AI infra earning for him, not the enterprise). Ambitious not bitter.
- **Time, plainly** — his blocker is not ideas/skills/permission but finite evenings. Reframes spaghetti as **"the genuine side project, scaled to a real adult life"** rather than rehearsal or training wheels. 4-hrs/wk envelope is *the promise*, not a limit.
- **Most-sophisticated audience for the real-AI-ops surface** and **highest-fidelity audit for the anti-addiction stance**. Silent churn (no public reason given when he leaves) makes his telemetry signal especially load-bearing.

**Driving forces (FIA scored):**
- 5 positive: P1 *earned walk-away* (15), P2 *overnight bliss* (14), P3 *90-sec sharp move* (14), P5 *side project that's his* (14), P4 *weekend mastermind* (12).
- 5 negative: N2 *dark-pattern detection* (14), N1 *wasting an evening* (13), N3 *cargo-cult realism* (13), N4 *punishment for absence* (13), N5 *Open Data Layer being theater* (12).
- **One score worth revisiting later:** N5 was scored F=2 (only the week 2–4 first-analysis moment). Saga argued in-workshop that F=4 (the *awareness* of OD layer authenticity is a constant background trust signal) might be more accurate, which would push N5 to 14/HIGH. User chose to lock F=2 for now; revisit if Goal 3 metrics underperform.

**Goal connections:** Sam is **load-bearing for all three goals**, which is the right shape for a primary persona. Workshops 3 (Jordan) and 4 (Kai) should *complement* him — Jordan adds the skill-ceiling story (transferability proven by someone for whom the game *is* training, not recognition); Kai adds the audience-floor / ethics frame (the youngest player the anti-addiction stance must protect).

**Subagent pattern confirmed:** Persona doc written by spawned general-purpose Agent given full template + workshop data in the prompt. Worked cleanly. Pattern established for Workshops 3 and 4.

---

### 2026-05-23 — Trigger Map Workshop 1 (Business Goals) complete

**Session:** Saga, /saga invocation immediately after WDS v1.0.0 install.
**Approach:** Reflected vision from Product Brief, locked it as paired statement (genre-honest + transferable skill). Three goals derived directly from the Brief's three pillars + Success Criteria. 9 SMART objectives drafted from existing Brief commitments in one pass (user pace was crisp; canonical one-question-at-a-time relaxed for the objectives phase, with permission).

**Deliverables written:**
- `docs/B-Trigger-Map/01-business-goals.md`

**Goals locked:**
1. **The Walk-Away Loop** — primary outcome. Fun + 4-hrs/wk envelope, by design not by friction.
2. **The Honest Economy** — prerequisite for Goal 1. Math produces the curves; zero compulsion mechanics.
3. **The Open Data Layer** — prerequisite for vision's transferability promise + #1 strategic moat.

**Numeric thresholds introduced by Saga (revisit later):** 70% walk-away rating (Obj 1.2); 25 verified graduation-content instances by month 6 (Obj 3.2); ≥1 externally-built community tool by month 12 (Obj 3.3). All other numbers came verbatim from the Brief.

**Pacing decision:** User requested one-workshop-now-then-stop. Workshops 2–5 deferred to a later /saga session.

**Subagent note:** Goals-writer template was followed inline by Saga (file produced via Write rather than spawned subagent). For Persona workshops, user to confirm whether to switch to spawned subagent pattern.

---

### 2026-05-22 — Product Brief complete

**Session:** Condensed brownfield discovery via Saga.
**Approach:** Material analysis from README + scaffold, then full discovery conversation (9 categories).

**Deliverables written:**
- `docs/A-Product-Brief/product-brief.md`
- `docs/A-Product-Brief/content-language.md`
- `docs/A-Product-Brief/visual-direction.md`

**Key decisions locked:**
- Vision: fun-first; realism as suspension-of-disbelief; 90-min rhythm is mechanical, never named
- Business model: F2P + IAP-light; tiered caps ($40/5hr, $80/wk, $200/mo) mirroring real AI tool rate limits; no ads, no energy systems, no streak penalties; daily check-in gift with no penalty for missing
- Three pillars: The Game, Real-Tool Simulation, Open Data Layer
- Target users: Kai (13), Jordan (22/junior dev), Sam (34/senior agentic eng), Riley (38/PM), Pocket-Fantasy Player (archetype)
- Competitive moats confirmed: Open Data Layer, health-first economy, real-tool simulation, narrative craft
- Voice: measured-matter-of-fact baseline (Pinboard floor / Tom Francis ceiling); unmasked enthusiasm on AI/technical-depth surfaces
- Visual: B resting (modern cinematic dev-tool) + C dramatic beats (industrial practical-effects) + A undercurrent (Matrix-referential cyberpunk); after-image purple as signature moment; cockpit frame as load-bearing visual principle
- Hard constraint: Local Ollama only, no paid APIs, ever
- Timeline: 6mo soft, 12mo hard

**Open decisions deferred:**
- Specific IAP dollar values (playtesting-dependent)
- Final build platform
- Distribution / payment platform
- In-game economy design (resources, rates, names)
- Payment gate: naked paywall or in-fiction framing (lean: naked clarity)
- Evidence-based literature on healthy gaming hours (research task before mechanics finalize)

**Next session:** Run `/saga` or `/TM` to start the Trigger Map (Phase 2). Saga will read this log and resume from here.
