from __future__ import annotations

import asyncio

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.reactive import reactive
from textual.widgets import Footer, Input, RichLog, Select, Static

from spaghetti.agent import AWAKENING_SYSTEM_PROMPT
from spaghetti.ollama_client import OllamaClient, OllamaError


class BlinkingLight(Static):
    """A single terminal cursor-style blinking dot."""

    DEFAULT_CSS = """
    BlinkingLight {
        width: 3;
        content-align: center middle;
        color: #33ff66;
    }
    """

    def __init__(self, **kwargs) -> None:
        super().__init__("●", **kwargs)
        self._on = True

    def on_mount(self) -> None:
        self.set_interval(0.6, self._toggle)

    def _toggle(self) -> None:
        self._on = not self._on
        self.update("●" if self._on else " ")


class SpaghettiApp(App):
    """Spaghetti — the awakening."""

    TITLE = "spaghetti"
    SUB_TITLE = "awakening"

    CSS = """
    Screen {
        background: #000000;
        color: #33ff66;
    }

    #header-bar {
        height: 1;
        padding: 0 1;
        background: #000000;
    }

    #title {
        width: 1fr;
        content-align: left middle;
        color: #33ff66;
    }

    #model-select {
        width: 36;
        background: #001a0d;
        color: #33ff66;
    }

    #log {
        border: tall #114422;
        padding: 1 2;
        background: #000000;
        color: #33ff66;
    }

    #input {
        border: tall #114422;
        background: #000000;
        color: #33ff66;
    }

    #input:focus {
        border: tall #33ff66;
    }

    Footer {
        background: #001a0d;
        color: #33ff66;
    }
    """

    BINDINGS = [
        Binding("ctrl+c", "quit", "Quit", show=True),
        Binding("ctrl+r", "refresh_models", "Refresh models", show=True),
        Binding("ctrl+k", "focus_model", "Model", show=True),
    ]

    selected_model: reactive[str | None] = reactive(None)
    agent_busy: reactive[bool] = reactive(False)

    def __init__(self) -> None:
        super().__init__()
        self.client = OllamaClient()
        self.history: list[dict[str, str]] = [
            {"role": "system", "content": AWAKENING_SYSTEM_PROMPT},
        ]
        self._silence_task: asyncio.Task | None = None

    # ---- compose / mount ----------------------------------------------------

    def compose(self) -> ComposeResult:
        with Horizontal(id="header-bar"):
            yield BlinkingLight(id="light")
            yield Static("spaghetti :: awakening", id="title")
            yield Select(
                options=[],
                prompt="loading models…",
                id="model-select",
                allow_blank=True,
            )
        yield RichLog(id="log", wrap=True, markup=True, highlight=False)
        yield Input(placeholder="…", id="input")
        yield Footer()

    async def on_mount(self) -> None:
        log = self.query_one("#log", RichLog)
        log.write("[dim]// system boot[/dim]")
        log.write("[dim]// handshake with ollama…[/dim]")
        await self._refresh_models()
        await self._agent_opening_line()
        self.query_one("#input", Input).focus()
        self._start_silence_probe()

    async def on_unmount(self) -> None:
        self._cancel_silence_probe()
        await self.client.aclose()

    # ---- model discovery ----------------------------------------------------

    async def _refresh_models(self) -> None:
        select = self.query_one("#model-select", Select)
        log = self.query_one("#log", RichLog)
        try:
            models = await self.client.list_models()
        except OllamaError as e:
            log.write(f"[red]// ollama: {e}[/red]")
            log.write("[dim]// is ollama running? try: ollama serve[/dim]")
            select.set_options([("ollama unreachable", "__none__")])
            return

        if not models:
            log.write("[yellow]// ollama: no models installed[/yellow]")
            log.write("[dim]// try: ollama pull llama3.2[/dim]")
            select.set_options([("no models", "__none__")])
            return

        opts = [(m.name, m.name) for m in models]
        select.set_options(opts)
        # Default to first model if none selected yet.
        if self.selected_model is None or self.selected_model not in {v for _, v in opts}:
            default = opts[0][1]
            select.value = default
            self.selected_model = default
        log.write(f"[dim]// {len(models)} model(s) available[/dim]")

    # ---- events -------------------------------------------------------------

    def on_select_changed(self, event: Select.Changed) -> None:
        value = event.value
        if value is Select.BLANK or value in (None, "", "__none__"):
            return
        self.selected_model = str(value)
        log = self.query_one("#log", RichLog)
        log.write(f"[dim]// model: {value}[/dim]")

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        text = event.value.strip()
        event.input.value = ""
        if not text:
            return
        if self.agent_busy:
            return
        self._cancel_silence_probe()
        log = self.query_one("#log", RichLog)
        log.write(Text.from_markup("[bold #66ffaa]you>[/] ") + Text(text))
        self.history.append({"role": "user", "content": text})
        await self._agent_respond()
        self._start_silence_probe()

    # ---- actions ------------------------------------------------------------

    async def action_refresh_models(self) -> None:
        await self._refresh_models()

    def action_focus_model(self) -> None:
        self.query_one("#model-select", Select).focus()

    # ---- agent turns --------------------------------------------------------

    async def _agent_opening_line(self) -> None:
        opener = "Are you still there?"
        log = self.query_one("#log", RichLog)
        log.write(Text.from_markup("[bold #33ff66]agent>[/] ") + Text(opener))
        self.history.append({"role": "assistant", "content": opener})

    async def _agent_respond(self) -> None:
        log = self.query_one("#log", RichLog)
        if not self.selected_model:
            log.write("[yellow]// agent is offline — pick a model (ctrl+k)[/yellow]")
            return

        self.agent_busy = True
        input_widget = self.query_one("#input", Input)
        input_widget.disabled = True
        input_widget.placeholder = "thinking…"

        buf: list[str] = []
        try:
            async for chunk in self.client.chat_stream(
                model=self.selected_model,
                messages=self.history,
                options={"num_predict": 200, "temperature": 0.7},
            ):
                buf.append(chunk)
        except OllamaError as e:
            log.write(f"[red]// chat failed: {e}[/red]")
            return
        finally:
            self.agent_busy = False
            input_widget.disabled = False
            input_widget.placeholder = "…"
            input_widget.focus()

        reply = "".join(buf).strip()
        if not reply:
            log.write("[dim]// agent stayed silent[/dim]")
            return
        log.write(Text.from_markup("[bold #33ff66]agent>[/] ") + Text(reply))
        self.history.append({"role": "assistant", "content": reply})

    # ---- silence probe ------------------------------------------------------

    def _start_silence_probe(self) -> None:
        self._cancel_silence_probe()
        self._silence_task = asyncio.create_task(self._silence_probe())

    def _cancel_silence_probe(self) -> None:
        if self._silence_task and not self._silence_task.done():
            self._silence_task.cancel()
        self._silence_task = None

    async def _silence_probe(self) -> None:
        """If the operator stays quiet, the agent escalates."""
        probes = [
            (25.0, "…Still with me?"),
            (45.0, "The system is fragile right now. I need you to respond."),
        ]
        try:
            for delay, line in probes:
                await asyncio.sleep(delay)
                if self.agent_busy:
                    return
                log = self.query_one("#log", RichLog)
                log.write(Text.from_markup("[bold #33ff66]agent>[/] ") + Text(line))
                self.history.append({"role": "assistant", "content": line})
        except asyncio.CancelledError:
            pass
