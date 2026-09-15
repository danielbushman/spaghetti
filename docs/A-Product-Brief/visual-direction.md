# spaghetti — Visual Direction

**Version:** 1.1 (pivot amendment)
**Date:** 2026-05-22 · amended 2026-09-15
**Phase:** 1 of 5 — Product Brief extension
**Agent:** Saga (WDS v1.0.0) · amended by the maker with Claude

> **v1.1 amendment.** The surface is no longer a chat cockpit drawn as a fake
> TUI. It is an enterprise admin console: Grafana more than AWS, some of
> Linear's simplicity, a slight fantasy edge, a slight casual-game finish. The
> three-layer aesthetic architecture, the color system and the intro sequence
> survive. The narrative frame, the typography and the "what this is not" list
> change. Changed sections are marked **(v1.1)**.

---

## Aesthetic Architecture

**One phrase (v1.1):** *"A billion-dollar company's console, drawn by someone who wanted you to enjoy being there."*

Three layers, always in this relationship:

| Layer | Role | Intensity |
|---|---|---|
| **B — Modern cinematic dev-tool** | Resting state. The majority surface. | 95% of the time |
| **C — Industrial practical-effects** | Dramatic beats. Specific narrative moments. | Punctuation, not atmosphere |
| **A — Neon cyberpunk (Matrix DNA)** | Persistent undercurrent. Always hinting through. | Never overwhelming; always present |

The game is never pure cyberpunk (A alone is exhausting to inhabit). It is never pure sleek dev-tool (B alone has no drama). C grounds the dramatic moments in physical reality — lights warming up, sparks, electricity — rather than digital abstraction.

**(v1.1) B is now specified more tightly.** Its references, in order of weight:

| Reference | What we take | What we leave |
|---|---|---|
| **Grafana** | Time-series panels, composable dashboards, a time picker on everything, the feeling that the data is alive | Its density; its chrome; its default palette |
| **Linear** | Keyboard-first, few controls per screen, crisp hierarchy, command palette | Its coolness; we are warmer |
| **Casual-game menus** (Two Point Hospital, Mini Metro) | Rounded, readable, generous spacing, delight in small transitions | Cartoon rendering; pixel art |
| **AWS / cloud consoles** | Real vocabulary, real screen *types* (cost explorer, audit log, budgets) | Nearly everything else. AWS is the counter-reference |

---

## Narrative Visual Frame (v1.1)

**The console.** The player co-founded the company; their partner built and
ran the system and is now gone. The player logs into the partner's console for
the first time as its operator. Every screen was made by someone who is not
here to explain it.

This frame is load-bearing for every UI decision:

> *Would the co-founder have built this screen, and would the player be glad to find it?*

The console is a place the co-founder lived in. It has their naming scheme,
their saved views, their half-finished runbooks. The fantasy edge lives here —
in names and lore, never in chrome. The Open Data Layer is the console's raw
tables and exports: real readings, none of them computing conclusions for you.

**Screens are rooms.** One decision per screen. Drill-downs are doors. The
visual language must make the map learnable: consistent placement, consistent
time picker, consistent group-by, a command palette to teleport once you know
the names.

**The Matrix homage** survives as structure and undercurrent:

| The Matrix | spaghetti |
|---|---|
| "Wake up, Neo" | First login |
| Falling green code | The console drawing in, screen by screen |
| The Operator | The operator (player) |
| The system (the Matrix) | The system (the AI enterprise) |
| Neo discovering his capabilities | The operator discovering what their partner built |

Inspired, not dressed.

---

## Color Direction

**Primary surface:** Deep warm greys. Not pure black (`#000000`). Not Matrix green. Something in the `#0D0D12`–`#141420` range — warm enough to not feel clinical, dark enough for the neon accents to land. **(v1.1)** A light theme is a later question; the console is dark-first.

**Signature accent:** Purple. Vivid but not garish — approximately `#9B6DFF` range. This is the brand's singular color moment. Appears at:
- The title card flash and after-image fade
- Select UI highlights and key status indicators
- Dramatic system-event accents

**Electric accent:** White-cyan. Appears at sparks, typing effects, system-online beats. High energy, brief, earned.

**After-image:** Translucent purple at key narrative beats. The title "SPAGHETTI" flashes full-bright → fades to translucent purple like staring into a light. This is a signature moment, not a recurring pattern.

**(v1.1) Data and status colors — hard constraint.** The maker cannot
distinguish green from amber. Therefore:
- No status may depend on hue alone. Every state carries a second channel: shape, icon, label, or position.
- Chart series use a colorblind-safe categorical palette (Okabe–Ito or a validated equivalent), never red/green or green/amber pairs.
- "Good / warning / bad" is blue / amber / magenta-red, plus icon, never green / amber / red.
- Money (runway, spend) keeps its own distinct hue so the eye reads it as money everywhere, as the current signal row already does.

**What to avoid:**
- Pure Matrix green (`#00FF41`) except as a knowing reference woven into texture — not a primary color
- Garish neon saturation at rest — the cyberpunk DNA shows through desaturation and restraint, not chromatic maximalism
- Pure white or pure black as primary surfaces

---

## Typography (v1.1)

**Direction:** Two faces, each with one job.

- **UI face: modern humanist sans.** Navigation, labels, buttons, prose in runbooks. Warm and generous — this is where the casual-game finish lives. Candidates: Inter, IBM Plex Sans, Geist.
- **Data face: modern monospace.** Numbers, tables, identifiers, fleet names, the audit log, anything the player will scan or compare. Candidates: JetBrains Mono, IBM Plex Mono, Berkeley Mono (premium).

**Why not monospace throughout anymore:** all-mono was the TUI's coherence.
A console with fourteen rooms needs the sans to make prose and navigation
comfortable, and the mono to make data honest. Mixing is the point now; the
rule is that a *kind* of content always gets the same face.

**Hierarchy:** Weight and scale do the work. Italic only for the co-founder's
voice (runbook notes, labels they wrote) if a distinction is needed.

---

## Signature Visual Moments

These are the cinematic beats. Outside these moments, the aesthetic rests.

### The Intro Sequence (v1.1 — beats 1–5 unchanged)

1. Industrial lamp warms up. Electric sounds. Physical lighting, not digital glow.
2. Sparks. Something electrical and slightly wrong.
3. The console draws in — the Overview assembling panel by panel, signals already moving.
4. **"SPAGHETTI"** flashes large across the screen.
5. Fades to translucent purple — the after-image of staring into the source.
6. **(v1.1)** First login lands on Overview. Runway is already falling. One incident is already open. Nothing explains itself. The co-founder's last audit-log entry is visible if you go looking.

### Data Motion (v1.1)

Sparklines and panels update with the motion library's spring and ease
primitives. Small transitions carry the casual-game delight: a panel that
settles, a number that rolls, a drill-down that opens like a door. Subtle
sparks survive at system-online and incident beats, not on every tick.

### Milestone / System Events

Industrial texture pulls through: a light flicker, a momentary glitch, an electric accent flash. Purple and cyan spike briefly. Settles. The dramatic language of C (industrial practical-effects) at the moments when the story moves. **(v1.1)** Bankruptcy is the largest of these: the console powers down, screen by screen, in reverse of the intro. Then the post-mortem.

### Resting UI State

Quiet. Functional. An operator's console. The drama has settled. The system is running. The screens are doing their job.

---

## What This Is Not (v1.1)

**Not:** Matrix green-on-black as a primary surface. That's the reference, not the costume.

**Not:** CRT scanlines and chromatic aberration as a resting aesthetic. Those are dramatic-beat textures, not always-on atmosphere.

**Not:** A TUI, real or fake. Retired with the pivot.

**Not:** An AWS clone. Real screen types and real vocabulary, yes. Its density, its decision load per screen, and its visual indifference, no.

**Not:** Pixel art or cartoon rendering. The casual-game finish is in spacing, rounding and motion, not in illustration style.

**Not:** Clean flat design. There is texture here. Roughness at the edges of the neon. The industrial layer is always hinting through.

---

## Platform Note

Implemented in browser (Bun + Svelte 5, `design/v-shape-prestige` branch). Final platform TBD. Visual direction should be implemented platform-agnostically — the aesthetic principles, color system, and typographic rules transfer. The specific rendering approach adapts.
