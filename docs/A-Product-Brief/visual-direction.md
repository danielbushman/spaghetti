# spaghetti — Visual Direction

**Version:** 1.0 (discovery draft)
**Date:** 2026-05-22
**Phase:** 1 of 5 — Product Brief extension
**Agent:** Saga (WDS v1.0.0)

---

## Aesthetic Architecture

**One phrase:** *"A Matrix-homage cockpit that a designer actually thought about."*

Three layers, always in this relationship:

| Layer | Role | Intensity |
|---|---|---|
| **B — Modern cinematic dev-tool** | Resting state. The majority surface. | 95% of the time |
| **C — Industrial practical-effects** | Dramatic beats. Specific narrative moments. | Punctuation, not atmosphere |
| **A — Neon cyberpunk (Matrix DNA)** | Persistent undercurrent. Always hinting through. | Never overwhelming; always present |

The game is never pure cyberpunk (A alone is exhausting to inhabit). It is never pure sleek dev-tool (B alone has no drama). C grounds the dramatic moments in physical reality — lights warming up, sparks, electricity — rather than digital abstraction.

---

## Narrative Visual Frame

**The cockpit.** The player wakes up as an operator in a cockpit. Their AI business is already running. Neither they nor their agent remember what happened. The system is rebooting. So are they.

This frame is load-bearing for every UI decision:

> *Does this belong in an operator's cockpit?*

The player is a pilot in instrumentation, not a gamer at a dashboard. The Open Data Layer is the cockpit's instrument panel — real gauges, real readings, none of them computing conclusions for you. Same as the real thing.

**The Matrix homage:**

| The Matrix | spaghetti |
|---|---|
| "Wake up, Neo" | "Are you alive?" |
| Falling green code | Functional TUI drawing in |
| The Operator | The operator (player) |
| The system (the Matrix) | The system (the AI business) |
| Neo discovering his capabilities | Operator discovering what they built |

The homage is structural (amnesia, discovery, reboot) and visual (cyberpunk DNA throughout) but spaghetti is not a Matrix skin. It's inspired, not dressed.

---

## Color Direction

**Primary surface:** Deep warm greys. Not pure black (`#000000`). Not Matrix green. Something in the `#0D0D12`–`#141420` range — warm enough to not feel clinical, dark enough for the neon accents to land.

**Signature accent:** Purple. Vivid but not garish — approximately `#9B6DFF` range. This is the brand's singular color moment. Appears at:
- The title card flash and after-image fade
- Select UI highlights and key status indicators
- Dramatic system-event accents

**Electric accent:** White-cyan. Appears at sparks, typing effects, system-online beats. High energy, brief, earned.

**After-image:** Translucent purple at key narrative beats. The title "SPAGHETTI" flashes full-bright → fades to translucent purple like staring into a light. This is a signature moment, not a recurring pattern.

**What to avoid:**
- Pure Matrix green (`#00FF41`) except as a knowing reference woven into texture — not a primary color
- Garish neon saturation at rest — the cyberpunk DNA shows through desaturation and restraint, not chromatic maximalism
- Pure white or pure black as primary surfaces

---

## Typography

**Direction:** Modern monospace. Contemporary, not retro.

**Why modern over vintage:** Vintage pixel fonts (VT323, DOS-style terminal) read as "costume cyberpunk" — genre signaling without design intention. Spaghetti's aesthetic is Matrix-inspired but designed, not nostalgic. Modern monospace is what an actual cockpit instrument panel would use if it were designed today.

**Candidate fonts (final TBD based on browser implementation):**
- JetBrains Mono — high readability at small sizes, designed for code contexts
- IBM Plex Mono — slightly warmer, more editorial character
- Berkeley Mono — the premium choice; strong personality, very readable

**Hierarchy:** Weight and scale do the work. Avoid font mixing — monospace throughout creates the TUI coherence. Italic only for in-character agent speech if needed for distinction.

---

## Signature Visual Moments

These are the cinematic beats. Outside these moments, the aesthetic rests.

### The Intro Sequence

1. Industrial lamp warms up. Electric sounds. Physical lighting, not digital glow.
2. Sparks. Something electrical and slightly wrong.
3. The TUI draws in — elements appearing, text rendering, the cockpit coming online.
4. **"SPAGHETTI"** flashes large across the screen.
5. Fades to translucent purple — the after-image of staring into the source.
6. The agent's first line appears, typed at deliberate pace:
   > *"Are you alive?"*

**Typing pace:** Faster than a human types; slower than real Claude or ChatGPT streaming. The pace is for narrative weight, not speed. Each character with a subtle spark.

### AI Typing Effect

Subtle sparks at each character during agent responses. Not overwhelming — more like the electrical potential of the connection than a visual effect. Maintains the sense that something real is happening, that the system is alive.

### Milestone / System Events

Industrial texture pulls through: a light flicker, a momentary glitch, an electric accent flash. Purple and cyan spike briefly. Settles. The dramatic language of C (industrial practical-effects) at the moments when the story moves.

### Resting UI State

Quiet. Functional. An operator's instrument panel. The drama has settled. The system is running. The cockpit is doing its job.

---

## What This Is Not

**Not:** Matrix green-on-black as a primary surface. That's the reference, not the costume.

**Not:** CRT scanlines and chromatic aberration as a resting aesthetic. Those are dramatic-beat textures, not always-on atmosphere.

**Not:** Cartoon, pixel art, or lo-fi game aesthetic. This is closer to a tool than a game, visually — which is exactly right, because the player is an operator, not a gamer.

**Not:** Clean flat design. There is texture here. Roughness at the edges of the neon. The industrial layer is always hinting through.

---

## Platform Note

Currently implemented in browser (d3, `browser-version` branch). Final platform TBD. Visual direction should be implemented platform-agnostically — the aesthetic principles, color system, and typographic rules transfer. The specific rendering approach adapts.
