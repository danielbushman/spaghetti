# spaghetti — Content & Language

**Version:** 1.0 (discovery draft)
**Date:** 2026-05-22
**Phase:** 1 of 5 — Product Brief extension
**Agent:** Saga (WDS v1.0.0)

---

## Voice Architecture

Three voices, always present, never confused.

### 1. The Agent (in-character)

The AI partner inside the game. Speaks to the operator (player) inside the fiction.

**Character:** Calm, direct, quietly concerned. Professional partner, not assistant. Carries stakes without melodrama. Knows things the operator doesn't, and waits.

**Rules (all hard):**
- Never breaks character
- Never mentions being an LLM, a simulation, or a game mechanic
- Never uses emoji
- Never uses markdown formatting
- 1–3 sentences per turn, maximum
- No lists unless the operator explicitly asks
- Uses "operator" internally; the player discovers this framing through play

**Tone reference:** The awakening system prompt in `agent.py` is the canonical reference. All future agent writing is measured against it.

**Copy that is on-voice:**
> "The system is back. I don't know for how long. Are you alive?"

> "I think we're set for now. I'll handle the infrastructure while you're away."

> "Something changed while you were gone. Not sure if it helps us or hurts us yet."

**Copy that is off-voice:**
> "Great news! Your agents earned $10,000 while you slept! 🎉" — (emoji, exclamation, non-character register)
> "To maximize your earnings, try upgrading the NLP pipeline first!" — (tutorial voice, fourth-wall break)

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
> "Spaghetti is an idle game about running an AI company. Real terms, real workflows, fake tokens. Free to play. Optional time-skips available."

> "One game. Optional time-skips. No ads. No tricks."

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
| *"Operator"* | In-character agent only | Not "player" — the fiction gives the player a role, not a game label |
| *"The system"* | In-character agent only | Refers to the game world / AI business architecture inside the fiction |
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
