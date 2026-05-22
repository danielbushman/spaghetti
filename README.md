# spaghetti

Have your state and eat it too.

Agent Architect — an idle game about building a billion-dollar AI company from a
blank prompt. You design and deploy agents, they work for you in 90-minute cycles,
and you learn real orchestration and observability patterns through play.
Everything runs locally against Ollama; there are no API costs.

This branch (`browser-version`) holds a browser port alongside the original
Textual TUI. They share the same canon (prompts, voice, beats) but each owns
its own rendering layer.

```text
┌─ src/spaghetti/         python — textual TUI       (run with `spaghetti` cli)
├─ src/server/            bun    — web server + ollama proxy
├─ src/client/            svelte — web ui
│  ├─ App.svelte          awakening scene orchestrator
│  ├─ agent.ts            system prompts (mirror of python/agent.py)
│  ├─ components/         BlinkingLight, Banner, Header, ChatLog, ChatMessage, Input, ModelSelect
│  ├─ stores/             chat / ollama / boot — Svelte 5 rune stores
│  └─ motion/             d3-ease wrappers, spring solver, arc paths, typewriter
└─ src/svelte-plugin.ts   tiny Bun plugin: .svelte and .svelte.ts → ESM
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
bun run dev            # builds, starts server on http://localhost:5173, watches
```

Or for production-style serving:

```sh
bun run build
bun run start          # serves dist/client + /api/*
```

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

Future motion candidates: SVG arcs for "thoughts in flight" between agents,
spring-based panel reveals when management UI lands, particle bursts on
contract closings.

## Tests

```sh
bun test
```

Pure-math sanity tests for the motion library. The server and Svelte
components are intentionally thin; if they grow they'll get tests too.

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
