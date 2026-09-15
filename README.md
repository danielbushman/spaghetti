# spaghetti

Have your state and eat it too.

An idle game about running a billion-dollar AI company from its console. You
co-founded Spaghetti Systems; your partner built and ran the system and is
gone; you have their console, six months of runway, and a company that burns
more than it earns. Learn the console well enough to turn the burn into
profit, or go bankrupt and start again with what you learned. Real terms,
real screens, fake tokens. Everything runs locally against Ollama; there are
no API costs.

**Status (2026-09-15):** the design pivoted to the enterprise console, and
the console's first slice is being built on this branch. The console is served
at `/`; the pre-pivot chat cockpit stays at `/cockpit/` until the console
replaces it. The intro, motion, signals and server carry forward; the chat
cockpit and the Python TUI are being retired. Design lives in `docs/` — start
with `docs/D-Design-Exploration/01-v-shape-prestige.md`, then the build plan
`docs/D-Design-Exploration/02-first-slice-plan.md` and
`docs/A-Product-Brief/product-brief.md` (v1.1).

```text
┌─ src/sim/               pure ts — the economy. step(state, dtHours, config, rng) → state.
│                         aggregate ledger, three planted bleeds, event log + replay, selectors.
│                         no DOM, no IO, no Date.now(), no Math.random(); the console injects time.
├─ src/console/           svelte 5 — the game surface, served at "/"
│  ├─ index.html          system fonts only; links /console.css, loads /console.js
│  ├─ App.svelte          shell: rail | top bar / room; ⌘K; global keys; boot
│  ├─ core/run.ts         RunController — all game logic, plain ts, unit-tested
│  ├─ stores/             game / router / palette — Svelte 5 rune wrappers
│  ├─ components/         Rail StatusPill Stat Panel DataTable TimeSeries BarList TierBadge Note TopBar Palette
│  ├─ rooms/              Overview Fleets FleetDetail Routing Spend
│  └─ theme.css           tokens + primitives (warm dark greys, purple accent)
├─ src/client/            svelte — the pre-pivot cockpit, served at "/cockpit/" (untouched)
├─ src/server/            bun    — static files + ollama proxy (/api/*)
├─ src/build.ts           two entries: cockpit (main.js) and console (console.js + console.css)
├─ src/svelte-plugin.ts   tiny Bun plugin: .svelte and .svelte.ts → ESM
├─ src/spaghetti/         python — textual TUI (retired; kept until the console lands)
└─ tests/                 bun test — sim/, console/, build.test.ts, motion.test.ts
```

## Requirements

- [Bun](https://bun.sh) ≥ 1.2
- [Ollama](https://ollama.com) reachable at `http://127.0.0.1:11434` (or set
  `OLLAMA_HOST`)
- At least one pulled model, e.g. `ollama pull llama3.2`

Python TUI also still works if you want it: `pip install -e ".[dev]"` then
`spaghetti`. See *Python TUI* below.

## Web — quickstart

```sh
bun install
bun run dev            # builds both entries, serves http://localhost:5173, watches src/client, src/console, src/sim
```

- `http://localhost:5173/` — the console (Overview first).
- `http://localhost:5173/cockpit/` — the pre-pivot cockpit.

Or for production-style serving:

```sh
bun run build          # dist/client: console.js + console.css + index.html, main.js + cockpit/index.html
bun run start          # serves dist/client + /api/*
```

Other scripts:

```sh
bun test               # everything under tests/
bun run sim:report     # the opening P&L, the three bleeds and what each fix buys, per seed
bun run typecheck      # tsc --noEmit over src/ and tests/
```

Until the console entry (`src/console/main.ts`) exists, `bun run build` logs
`[build] console entry missing, skipping` and the server falls back to the
cockpit html at `/`. That is the wave-1 state, not a bug.

Environment vars (all optional):

| var                       | default                            | what                                                     |
| ------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `PORT`                    | `5173`                             | HTTP port                                                |
| `OLLAMA_HOST`             | `http://127.0.0.1:11434`           | upstream Ollama base URL                                 |
| `DIST_DIR`                | `dist/client`                      | where to serve static SPA from                           |
| `SPAGHETTI_LOG_DIR`       | `~/.spaghetti/game-chat-histories` | where chat history JSONL files are written               |
| `SPAGHETTI_LOG_DISABLED`  | unset                              | set to `1` to turn off chat history persistence entirely |

## Chat history persistence

Every browser session writes a JSONL file to
`~/.spaghetti/game-chat-histories/YYYY-MM-DD_HH-MM-SS.chat-history.jsonl`.
One event per line — `session_start`, `user_message`, `agent_message`
(with model name + source: `stream` / `typed_in` / `checkin`),
`system_message`, `scene_phase`, `pick_status` (with `trigger: "manual"`
or `"auto"`), `boot_online`, `chat_failed`, `agent_silent`,
`checkin_failed`, `checkin_dropped`. Always on, including dev runs.

### One server, two roles

The decision: a single Bun process owns both the static SPA and the `/api/*`
routes. No Vite. Bun's bundler is fast enough for this codebase that the dev
watcher (`bun run dev`) gives sub-second rebuilds; if HMR ever becomes
necessary we can layer it on without restructuring. Reasons:

- **Ollama lives on the loopback interface** and has CORS off by default.
  A same-origin proxy avoids fighting that, and keeps a place to add game
  state (Bun has SQLite built in) when the time comes.
- **Bun.serve handles streaming bodies natively** — `/api/chat` literally hands
  Ollama's `ReadableStream` back to the client untouched. No buffering, no
  re-encoding.
- **Two-runtime setups (Vite + Node/Bun) are mostly justified by Vite's plugin
  ecosystem.** Svelte 5's compiler is small and the only "plugin" we need is
  ~50 lines (`src/svelte-plugin.ts`), so the ecosystem argument doesn't apply.

If we later need stronger frontend tooling, the project is laid out so Vite
can take over `src/client/` while Bun continues to own `src/server/`.

## Console — first slice

The console is the game. You log in to your co-founder's screens over a real,
deterministic economy — an aggregate ledger of rates, ticked one sim-hour at a
time — and you have to find where the money goes. Every number a room shows is
a selector over that ledger. Nothing explains itself; nothing recommends. Where
a room shows a counterfactual ("last 7d at small: $4.5k/day") it is a re-pricing
of recorded tokens at a listed price, never advice.

At first login the company has about six months of runway, is burning about
$5.6M a sim-week, and one incident is already open. Three bleeds are planted in
the ledger; none of them is labelled. The loop is the SRE loop: notice →
investigate → act → wait → verify.

### Rooms

One decision per screen. Hash routes, no server involvement.

| room               | route                 | shows                                                              | lever                                              |
| ------------------ | --------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Overview           | `#/overview`          | runway, slope, the cash curve with its projection, signals, incidents | none — doors out only                           |
| Fleets             | `#/fleets`            | every fleet: status, tier mix, cost/day, tokens/day, error %, attempts/job, utilization, queue, slots | pause / resume; scale-to-zero |
| Fleet detail       | `#/fleets/:id`        | the co-founder's notes, workloads, tokens by tier, error budget      | routing policy + concurrency; retry policy (for now) |
| Models & Routing   | `#/routing?tier=`     | rules table, the effective-routing grid (size class × tier), prices | add / edit / remove routing rules — the big one    |
| Spend Explorer     | `#/spend?group=&range=&top=&fleet=` | where the money goes, grouped by fleet / model / workload / customer | none — every row is a door |

Spend rows link to the lever: fleet and workload rows open the fleet, model
rows open Routing with that tier outlined. Customer rows have no door yet
(there is no Customers room in this slice).

### ⌘K and keys

`⌘K` / `Ctrl+K` opens the palette: rooms and fleets, fuzzy-matched
(`halb` + Enter lands on `halberd-monitor`). `Esc` closes it. With the palette
closed, `g o` / `g f` / `g r` / `g s` jump to Overview / Fleets / Routing /
Spend, and `Space` toggles pause. None of that fires while you are typing in a
field — "go small" in a rule note goes nowhere.

### Time

One tick is one sim-hour; the wall clock runs at **one sim-week per real day**
at 1×. The top bar holds `▶ / ⏸`, a speed select labelled by what it means, and
two manual advances:

| speed | meaning       |
| ----- | ------------- |
| 1×    | 1 wk / day    |
| 24×   | 1 wk / hour   |
| 168×  | 1 wk / 8.6 min |
| 1008× | 1 wk / 86 s   |

`+1 day` and `+1 week` step the sim immediately. Paused time never accrues.
When you come back, the run catches up (capped at one sim-year) and the top bar
says once how long you were away and what it cost.

After you act and the run has moved at least a day, the top bar answers with
what the action bought: `▲ +3.1 wk bought`, `no change`, `▼ −0.5 wk`,
`▲ climbing`, or `runway now finite · 26 wk`. The baseline is the runway at the
moment you acted, so the number attributes to you only what changed since.
Advances with no action pending never show a badge.

### Persistence and reset

Only the event log is stored, under the `localStorage` key
`spaghetti.console.run.v1` (`{ version, seed, log, time }`). State is
regenerated by replaying the log over the seeded world, so a save is a few KB
and a hard refresh preserves the run, with catch-up applied. To reset:

```js
localStorage.removeItem('spaghetti.console.run.v1')   // in the browser devtools, then reload
```

The seed is recorded in the save; the same seed and log reproduce the same
state bit-for-bit within one JS engine. Checkpoint hashes are verified on load;
a mismatch is logged and replay is trusted.

### Tuning

Every numeric knob lives in `src/sim/constants.ts`. Tests pin outcomes
(bankruptcy window, flatten ratio, inflection), not constants, so a retune is a
one-file edit. `bun run sim:report` prints the opening P&L and what each fix
buys, per seed.

### Not in this slice

Each of these has a typed hook and no behaviour (plan §8):

- **Intro sequence** — `App.svelte` `TODO(intro)`, gated on `game.run.isFirstLogin`.
- **Prestige / post-mortem** — `PostMortemHook` in `src/sim/events.ts`; `TODO(prestige)` in `core/run.ts` and the top bar's "new run".
- **Incidents room** — the `Incident` type and `openIncidents` selector exist; the retry policy panel sits on Fleet detail (`TODO(incidents)`) until then.
- **Audit log** — every event already carries `t` and `wallMs`; `TODO(audit-log)` in Routing.
- **Customers, Budgets, Runbooks rooms** — the selectors they need (`explore` by customer, per-fleet totals, `FleetDef.notes`) exist; the rooms do not.
- **Copilot** — none. The game runs with Ollama off.
- **SQLite** — `SaveRecord` is the row shape; `persistence.ts` is the only writer.

## API surface

The browser talks only to the local Bun server, never to Ollama directly.

| route          | method | body / response                                            |
| -------------- | ------ | ---------------------------------------------------------- |
| `/api/models`  | `GET`  | `{ models: [{ name, size? }] }`                            |
| `/api/chat`    | `POST` | request: `{ model, messages, options }` — response: NDJSON |

NDJSON shape (one JSON object per line, terminated by `{ "done": true }`):

```json
{ "message": { "role": "assistant", "content": "Hello" }, "done": false }
{ "message": { "role": "assistant", "content": " there" }, "done": false }
{ "done": true }
```

## Motion library

`src/client/motion/` collects the math behind cartoon and video-game motion so
you have it on hand at every call site.

- **`easings.ts`** — Robert Penner's easings (via `d3-ease`) re-exported with
  cartoon-named aliases: `anticipate`, `launch`, `settle`, `smooth`, `breathe`,
  `overshoot`, `swoosh`, `boing`, `bounce`, `linear`. Each maps to one of
  Disney's 12 principles (anticipation, follow-through, slow in/out, etc.).
- **`spring.ts`** — analytic spring solver (`springAt(t, config)`) with three
  regimes (under/critical/over-damped) and named presets (`pop`, `wobbly`,
  `thick`, `noWobble`). Plus `animateSpring(onTick, config)` which runs to
  visual rest and cleans up after itself.
- **`arcs.ts`** — parametric path generators: `lobArc` (parabolic projectile),
  `quadBezier`, `cubicBezier`, `catmullRom` (passes through waypoints). Each
  returns `(t: 0..1) => [x, y]`.
- **`typing.ts`** — per-character delay function for typewriter rhythm.
  Punctuation pauses, letters fly, occasional micro-hitch. Pinned to feel
  like the agent thinking, not a printer.
- **`sparks.ts`** / **`flares.ts`** — body-appended particle emitters
  driven by WAAPI. Sparks are small ballistic specks (cursor + contract-
  close bursts); flares are larger radial blooms (boot flashes).
- **`thoughtArc.ts`** — `flyThought(from, to)` / `flyThoughtBetween(elA, elB)`.
  Draws a curved SVG path with a luminous head + fading trail between two
  viewport points. Used for agent-to-agent "thoughts in flight".

The public references behind these (none of which we depend on as a library,
just intellectually):

| reference                                                           | what                              |
| ------------------------------------------------------------------- | --------------------------------- |
| Robert Penner, *Programming Macromedia Flash MX* (2002)             | the easing canon                  |
| Thomas & Johnston, *The Illusion of Life* (1981)                    | Disney's 12 principles            |
| Steve Swink, *Game Feel* (2008)                                     | motion as game design substance   |
| Jan Willem Nijman, "The art of screenshake" (GDC 2013)              | juice / amplification             |
| Jonas Tyroller, "Why my puzzle game feels good" (YouTube, 2022)     | settle / overshoot / anticipation |

## Animation done in the browser version

- Header dot **breathes** on a sine-eased triangle wave; color and cadence
  shift across cold → warm → online boot states.
- Boot banner **cross-fades** color the same way.
- Each message **slides in** with `overshoot` easing — user from the right,
  agent from the left, system fades.
- Streaming agent responses **type in** at the typewriter cadence, fed by a
  buffer that the receive task fills while the display task drains.
- A cursor `▌` **blinks** while a message is still typing, vanishes when done.
- The input border **glows** softly on focus.
- **Thoughts in flight** — when the agent surfaces a new diagnostic, or
  commits to a fix, a luminous arc flies from the heart-dot in the header
  to the affected status row. SVG path with a glowing head + fading trail,
  curved via `quadBezier` and timed on `swoosh` easing. See
  `motion/thoughtArc.ts`. (When fleet-of-agents gameplay lands, the same
  primitive will fire arc-to-arc between sub-agents.)
- **Spring panel reveals** — the side column slides in from the right on
  an analytic spring (`SPRINGS.noWobble`) via the `springReveal` Svelte
  action. Same primitive will drive the management UI panel when it lands;
  pass `from: "left"` or `from: "bottom"` per the layout.
- **Particle bursts on contract closings** — when a status item flips
  green, an omnidirectional spark spray bursts from the row. The same
  `contractBurst` primitive will fire on the contract-closed event when
  real contract gameplay arrives.

## Tests

```sh
bun test                        # everything
bun test tests/build.test.ts    # the two-entry build: console.js + console.css + cockpit/
bun test tests/sim              # the economy: determinism, replay, economy, invariants, explore, metrics
bun test tests/console          # router, format, persistence, RunController, palette, the walkthrough
```

Tests import only plain `.ts` modules — every algorithm lives in one. Rune
modules and components are covered by the build smoke test; `bun test` has no
Svelte plugin. The motion test has a known timing flake on slow containers;
rerun it before believing it.

## Python TUI

The original Textual TUI is still in `src/spaghetti/`. It is the source of
truth for the prompt and the awakening scene's beats; the web client mirrors
those rather than diverging.

```sh
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
spaghetti
```

If at some point the web version becomes the canonical surface, the Python
package will be removed in a single commit; until then they live side by side
and the web mirrors any prompt changes there.
