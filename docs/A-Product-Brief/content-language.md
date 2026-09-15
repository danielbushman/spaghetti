# spaghetti — Content & Language

**Version:** 1.1 (pivot amendment)
**Date:** 2026-05-22 · amended 2026-09-15
**Phase:** 1 of 5 — Product Brief extension
**Agent:** Saga (WDS v1.0.0) · amended by the maker with Claude

> **v1.1 amendment.** The warm AI partner who talked the operator through a
> reboot is gone — literally, in the fiction: the co-founder who built the
> system has left, and the player inherits their console. The in-character
> voice therefore changes shape (see *The Co-founder* and *The Copilot*
> below). The Game voice and the Maker voice are unchanged. Changed sections
> are marked **(v1.1)**.

---

## Voice Architecture

Three voices, always present, never confused.

### 1. In-character voices (v1.1)

Two in-character voices replace the single Agent. Both live inside the console.

#### 1a. The Co-founder (absent)

The partner who built and ran the system. Never present. Speaks only through
what they left: runbook notes, fleet names, dashboard titles, audit-log
comments, alert descriptions. Every one of these is a line of dialogue from
someone who is not coming back to explain it.

**Character:** Precise, dry, a little tired, fond of naming things. Wrote for
themself, not for a reader — which is why the player has to work to follow.
Knew where the bodies were buried and had started writing it down.

**Rules (all hard):**
- Never addresses the player directly (they did not know they were leaving)
- Never explains a game mechanic; explains *their* system, in *their* shorthand
- Notes are dated, partial, sometimes wrong — the last ones trail off
- No emoji. No markdown beyond what a real runbook would have
- The fantasy edge lives here: names with character, the occasional private joke

**Copy that is on-voice (runbook note):**
> "summarizer-east is on the big model because I never got around to the eval. Don't let it stay that way."
>
> "If halberd-monitor pages twice in an hour it's the retry loop again. Circuit-break it and go back to bed."
>
> "Renamed the ingest fleets after rivers. Sorry. It was late."

**Copy that is off-voice:**
> "Welcome, operator! Here's how routing works:" — (addresses the player, tutorial register)
> "Hope you're doing okay without me." — (melodrama; they did not know)

#### 1b. The Copilot (optional, ⚖)

A deliberately limited ops assistant the co-founder built into the console,
running on the local model. Answers questions about *what the console shows*.
Does not know why. Does not decide anything. Optional at runtime; the game is
fully playable without it.

**Character:** Calm, direct, literal. Reads the data back; points at a screen.
Never warm the way the old partner voice was — that warmth left with the
co-founder, and the absence should be felt.

**Rules (all hard):**
- Never breaks character; never mentions being an LLM, a simulation, or a game mechanic
- Never uses emoji or markdown
- 1–3 sentences per turn; no lists unless asked
- Answers with a screen reference, never with a conclusion: "Spend Explorer, group by model, last seven days" — not "you should switch models"
- Uses "operator"; the player discovers the framing through play

**Copy that is on-voice:**
> "Runway dropped faster than baseline this week. The change lines up with a routing edit in the audit log."
>
> "Three fleets are over budget. Token Budgets has them sorted."

**Copy that is off-voice:**
> "Great news! Your fleets earned $10,000 while you slept! 🎉" — (emoji, exclamation, non-character register)
> "To maximize your earnings, switch summarizer-east to the small model!" — (conclusion, tutorial voice)

**Tone reference:** the co-founder's runbook lines above are the canonical
reference for 1a. For 1b, the pre-pivot awakening prompt in `agent.py` is the
reference for restraint, not for warmth.

---

### 2. The Game (out-of-character)

Store pages, UI labels, FAQ, devlog, trust page, buy page, credits. The maker's voice, never the agent's.

**Character:** Measured matter-of-fact baseline. The author is present in every line; the author is never the subject. Trust through restraint — what the copy doesn't try to sell. Short declarative sentences. No pitching.

**Tonal range:**
- **Floor (measured):** Short, plain, specific. Pinboard-level restraint. Used when energy is low or the topic is routine.
- **Ceiling (knowing, restrained warmth):** Tom Francis-level. Assumes a smart reader. Small rewards for those who catch the subtext. Used when the topic is the domain the maker lives in (AI, orchestration, agent ops).
- **Natural variation:** Energy rises when the topic is AI/technical depth. Stays measured otherwise. The topic decides the temperature, not the format.

**"Knowing" defined:** Writing that trusts the reader to fill in subtext without spelling it out. Small implied recognition between writer and reader. The opposite of earnest/literal. Risk: slides into smug if overdone. Rule: knowing is a small reward, never the mechanism.

**References:**
- Tom Francis / [pentadact.com](https://www.pentadact.com/) — primary reference for the ceiling
- Pinboard / [pinboard.in](https://pinboard.in/about/) — primary reference for the floor

**Copy that is on-voice (store page):**
> "Spaghetti is an idle game about running a billion-dollar AI company from its console. Real terms, real screens, fake tokens. Free to play. Optional time-skips available."
>
> "One game. Optional time-skips. No ads. No tricks."
>
> "The data is yours. Export it, analyze it, point an agent at it. That's not cheating. That's good play."

**Copy that is off-voice:**
> "Experience the thrill of building your AI empire in this revolutionary idle game!" — (marketing pitch, exclamation, empty claims)
> "We believe deeply in player wellbeing and have designed every mechanic with care." — (preachy, makes the maker the subject)

---

### 3. The Maker (personal surfaces)

Devlogs, technical community posts, demo videos, Discord/Slack presence. The maker's own voice — not the game's voice, not the agent's.

**Character:** Friendly, upbeat AI domain expert. Unmasked enthusiasm when the topic is AI — this is the natural mode, not a performance. Matter-of-fact at baseline. Gives props to others readily. Does not make the topic about themselves.

**Where this voice lives:** Devlogs, YouTube demos, dev community presence (Slack, Discord, technical subreddits). Cross-pollinates organically — people who like the maker's voice in these contexts find the game and recognise the same careful thinking behind it.

**Strategic note:** This is the voice most likely to generate organic reach, because it lives on the surfaces (technical demos, AI community contributions) that the target audience already inhabits. The game's restrained voice cannot carry virality; the maker's genuine enthusiasm can. Don't conflate them or mute either one.

---

## Linguistic Markers

Specific phrases and framings that carry meaning in spaghetti's voice:

| Phrase | Where | What it signals |
|---|---|---|
| *"Fake tokens"* | Store page, devlog | We know what real tokens cost; we're explicit about the difference |
| *"Real terms, real workflows"* | Store page, FAQ | The domain texture is authentic; we're not faking the vocabulary |
| *"Good play"* | Data layer docs, FAQ | Elevates AI-augmented gameplay; signals no judgment or gatekeeping |
| *"Rate limit"* | IAP cap UI, FAQ | Mirrors real AI tool language intentionally; connects to graduation pillar |
| *"Operator"* | In-character voices only | Not "player" — the fiction gives the player a role, not a game label |
| *"The console"* | All surfaces | The game's surface and its subject; never "the app" or "the dashboard" (v1.1) |
| *"Fleet"* | In-game, docs | The unit of scale. Never "agents" in the plural as a count (v1.1) |
| *"The system"* | In-character voices only | Refers to the game world / AI business architecture inside the fiction |
| *"Touch grass"* | Devlog / maker voice only | Permitted with the maker's own enthusiasm; not in game UI or store copy |

---

## Content Rules (all surfaces)

- Never preach the 90-minute rhythm
- Never say "learn" in proximity to the game in marketing copy ("learn AI by playing spaghetti" feels like school)
- Never use "revolutionary," "game-changing," or similar empty escalators
- Never make the maker the grammatical subject in game or store copy
- Never explain what the player "should" feel or learn
- The caps (IAP tiers) are documented quietly; never headlined
- Realism is felt, not announced
- **(v1.1)** A real term never lies. If the simulation cannot honor a term's meaning, do not use the term

---

## Language Strategy

**Primary language:** English.
**Secondary markets:** Deferred. The technical nature of the domain (real AI ops terminology) creates localization complexity that should be addressed post-MVP.
**Localization principle (for future):** The agent's voice is the hardest surface to localize — it carries character, not just information. Prioritize localization budget there.

---

## SEO / Discoverability Notes

**Primary search intent:** People who have consumed YouTube AI-hype content and want to experience the AI-tycoon fantasy interactively.

**Keyword territory (to own):**
- AI tycoon game
- build AI company game
- AI agent idle game
- free AI simulation game
- manage AI agents game

**Keyword territory (to avoid):**
- "Learn AI" — implies school, repels the fantasy-driven audience
- "AI education" / "AI tutorial" — same problem
- "AI startup simulator" — positions against serious simulators, not idle games

**Competitive copy note:** Every competing title uses the same descriptive vocabulary ("build," "grow," "empire," "garage to global"). Spaghetti's copy should be distinguishable at a glance — shorter, plainer, specific about what it's honest about (fake tokens, local models, no tricks).
