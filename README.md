# spaghetti

Have your state and eat it too.

Agent Architect — a terminal-native idle game about building a billion-dollar AI
company from a blank prompt. You design and deploy agents, they work for you in
90-minute cycles, and you learn real orchestration and observability patterns
through play. Everything runs locally against Ollama; there are no API costs.

## Current status

Scaffold only. This commit lands:

- Textual TUI shell with the first "awakening" beat: blinking light, green-on-black,
  agent opens with *"Are you still there?"* and escalates if you stay silent.
- Live model selector in the header bar — switch Ollama models at any time.
- Ollama HTTP client (streaming chat + model list) with graceful failure when
  the daemon is down or no models are installed.
- Project layout, tests for the Ollama client, and tooling config.

## Requirements

- Python 3.11+
- [Ollama](https://ollama.com) running on the default port (`127.0.0.1:11434`)
- At least one pulled model, e.g. `ollama pull llama3.2`

## Quickstart

```sh
# one-time setup
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# make sure ollama is up and has a model
ollama serve &
ollama pull llama3.2

# launch the game
spaghetti
# or: python -m spaghetti
```

### Key bindings

| Key | Action |
| --- | --- |
| `Ctrl+C` | Quit |
| `Ctrl+R` | Refresh the model list from Ollama |
| `Ctrl+K` | Focus the model selector |
| `Enter`  | Send message |

## Layout

```
src/spaghetti/
├── __main__.py        # entrypoint
├── app.py             # Textual App + awakening screen
├── agent.py           # system prompts / personas
└── ollama_client.py   # async Ollama HTTP client
tests/
└── test_ollama_client.py
```

## Development

```sh
pytest
ruff check src tests
```

Textual's devtools can be attached for live CSS editing:

```sh
textual run --dev spaghetti.app:SpaghettiApp
```
