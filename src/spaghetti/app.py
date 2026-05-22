from __future__ import annotations

import asyncio
import random

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.reactive import reactive
from textual.widgets import Footer, Input, RichLog, Select, Static

from spaghetti.agent import AWAKENING_SYSTEM_PROMPT, CHECKIN_INSTRUCTION
from spaghetti.ollama_client import OllamaClient, OllamaError


BOOT_BANNER = r"""
  ___ ___  ___  ___ _  _ ___ _____ _____ ___
 / __| _ \/ _ \/ __| || | __|_   _|_   _|_ _|
 \__ \  _/ (_) \__ \ __ | _|  | |   | |  | |
 |___/_|  \___/|___/_||_|___| |_|   |_| |___|
"""


CURSOR = "▌"


def _char_delay(ch: str) -> float:
    """Per-character typing delay with rhythm — punctuation pauses, letters are quick."""
    if ch in ".!?":
        return random.uniform(0.13, 0.22)
    if ch in ",;:":
        return random.uniform(0.05, 0.10)
    if ch == "\n":
        return random.uniform(0.07, 0.13)
    if ch == " ":
        return random.uniform(0.008, 0.024)
    # tiny chance of a longer beat anywhere — feels human
    if random.random() < 0.015:
        return random.uniform(0.04, 0.09)
    return random.uniform(0.007, 0.017)


class BlinkingLight(Static):
    """A single terminal cursor-style blinking dot whose color shifts with system state."""

    DEFAULT_CSS = """
    BlinkingLight {
        width: 3;
        content-align: center middle;
        color: #661111;
    }
    BlinkingLight.cold {
        color: #ff3333;
    }
    BlinkingLight.warm {
        color: #ffaa33;
    }
    BlinkingLight.online {
        color: #33ff66;
    }
    """

    def __init__(self, **kwargs) -> None:
        super().__init__("●", **kwargs)
        self._on = True
        self._interval = 0.9  # slow at boot, speeds up when online

    def on_mount(self) -> None:
        self._timer = self.set_interval(self._interval, self._toggle)

    def _toggle(self) -> None:
        self._on = not self._on
        self.update("●" if self._on else " ")

    def set_rate(self, seconds: float) -> None:
        self._interval = seconds
        if hasattr(self, "_timer"):
            self._timer.stop()
        self._timer = self.set_interval(seconds, self._toggle)


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
        color: #226633;
        text-style: bold;
    }
    #title.online {
        color: #33ff66;
    }

    #model-select {
        width: 36;
        background: #001a0d;
        color: #33ff66;
    }

    #banner {
        height: 6;
        content-align: center middle;
        padding: 0 1;
        color: #114422;
        text-style: bold;
    }
    #banner.warm {
        color: #886622;
    }
    #banner.online {
        color: #33ff66;
    }

    #log {
        border: tall #114422;
        padding: 1 2;
        background: #000000;
        color: #33ff66;
    }

    #draft {
        height: auto;
        min-height: 1;
        padding: 0 3;
        background: #000000;
        color: #33ff66;
        text-style: bold;
    }

    #input {
        border: tall #114422;
        background: #000000;
        color: #33ff66;
        text-style: bold;
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
    booted: reactive[bool] = reactive(False)

    def __init__(self) -> None:
        super().__init__()
        self.client = OllamaClient()
        self.history: list[dict[str, str]] = [
            {"role": "system", "content": AWAKENING_SYSTEM_PROMPT},
        ]
        self._silence_task: asyncio.Task | None = None
        self._prior_checkins: list[str] = []

    # ---- compose / mount ----------------------------------------------------

    def compose(self) -> ComposeResult:
        with Horizontal(id="header-bar"):
            yield BlinkingLight(id="light")
            yield Static("", id="title")
            yield Select(
                options=[],
                prompt="loading models…",
                id="model-select",
                allow_blank=True,
            )
        yield Static(BOOT_BANNER, id="banner")
        yield RichLog(id="log", wrap=True, markup=True, highlight=False)
        yield Static("", id="draft")
        yield Input(placeholder="…", id="input", disabled=True)
        yield Footer()

    async def on_mount(self) -> None:
        light = self.query_one("#light", BlinkingLight)
        light.add_class("cold")
        # The boot sequence runs as a background task so the UI stays responsive.
        self._boot_task = asyncio.create_task(self._boot_sequence())

    async def on_unmount(self) -> None:
        self._cancel_silence_probe()
        await self.client.aclose()

    # ---- boot sequence ------------------------------------------------------

    async def _boot_sequence(self) -> None:
        light = self.query_one("#light", BlinkingLight)
        banner = self.query_one("#banner", Static)
        title = self.query_one("#title", Static)

        await asyncio.sleep(0.6)

        boot_lines = [
            ("// system: cold boot detected", 0.35),
            ("// memory ............... ok", 0.25),
            ("// agent core ........... loading", 0.4),
            ("// agent core ........... ok", 0.25),
            ("// ollama: handshake ...", 0.0),
        ]
        for line, pause in boot_lines:
            await self._type_log_line(line, style="dim #557755")
            await asyncio.sleep(pause)

        # Handshake with ollama — this populates the model select.
        await self._refresh_models(quiet=True)

        # Warm-up: amber.
        light.remove_class("cold")
        light.add_class("warm")
        banner.add_class("warm")
        await self._type_log_line("// ollama ............... ok", style="dim #557755")
        await asyncio.sleep(0.6)

        # Online: green.
        light.remove_class("warm")
        light.add_class("online")
        light.set_rate(0.5)
        banner.remove_class("warm")
        banner.add_class("online")
        title.add_class("online")
        title.update("spaghetti :: awakening")
        await asyncio.sleep(0.5)

        self.booted = True
        self.query_one("#input", Input).disabled = False
        self.query_one("#input", Input).focus()

        await asyncio.sleep(0.4)
        await self._agent_opening_line()
        self._start_silence_probe()

    # ---- model discovery ----------------------------------------------------

    async def _refresh_models(self, quiet: bool = False) -> None:
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
        if self.selected_model is None or self.selected_model not in {v for _, v in opts}:
            default = opts[0][1]
            select.value = default
            self.selected_model = default
        if not quiet:
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
        if not text or not self.booted:
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

    # ---- typing primitives --------------------------------------------------

    async def _type_log_line(self, text: str, style: str = "") -> None:
        """Type a single boot/system line into the log with a moving cursor."""
        draft = self.query_one("#draft", Static)
        log = self.query_one("#log", RichLog)
        typed: list[str] = []
        for ch in text:
            typed.append(ch)
            partial = "".join(typed)
            if style:
                draft.update(Text.from_markup(f"[{style}]{partial}{CURSOR}[/]"))
            else:
                draft.update(Text(partial + CURSOR))
            await asyncio.sleep(_char_delay(ch))
        draft.update("")
        if style:
            log.write(Text.from_markup(f"[{style}]{text}[/]"))
        else:
            log.write(text)

    async def _stream_typed(
        self,
        messages: list[dict[str, str]],
        options: dict,
    ) -> tuple[str, OllamaError | None]:
        """Stream a response from Ollama and type it out with motion. Returns (text, error)."""
        draft = self.query_one("#draft", Static)
        buf: list[str] = []
        receive_done = False
        error: OllamaError | None = None

        async def receive() -> None:
            nonlocal receive_done, error
            try:
                async for chunk in self.client.chat_stream(
                    model=self.selected_model,  # type: ignore[arg-type]
                    messages=messages,
                    options=options,
                ):
                    buf.extend(list(chunk))
            except OllamaError as e:
                error = e
            finally:
                receive_done = True

        typed: list[str] = []

        def _render() -> None:
            partial = "".join(typed)
            draft.update(
                Text.from_markup("[bold #33ff66]agent>[/] ")
                + Text(partial, style="bold #33ff66")
                + Text(f" {CURSOR}", style="#33ff66")
            )

        async def display() -> None:
            while True:
                if buf:
                    ch = buf.pop(0)
                    typed.append(ch)
                    _render()
                    await asyncio.sleep(_char_delay(ch))
                elif receive_done:
                    break
                else:
                    await asyncio.sleep(0.015)

        receive_task = asyncio.create_task(receive())
        await display()
        await receive_task
        draft.update("")
        return "".join(typed), error

    # ---- agent turns --------------------------------------------------------

    async def _agent_opening_line(self) -> None:
        opener = "Are you still there?"
        await self._type_agent_text(opener)
        self.history.append({"role": "assistant", "content": opener})

    async def _type_agent_text(self, text: str) -> None:
        """Type an out-of-band (non-streaming) agent line with the same cursor motion."""
        draft = self.query_one("#draft", Static)
        log = self.query_one("#log", RichLog)
        typed: list[str] = []
        for ch in text:
            typed.append(ch)
            partial = "".join(typed)
            draft.update(
                Text.from_markup("[bold #33ff66]agent>[/] ")
                + Text(partial, style="bold #33ff66")
                + Text(f" {CURSOR}", style="#33ff66")
            )
            await asyncio.sleep(_char_delay(ch))
        draft.update("")
        log.write(Text.from_markup("[bold #33ff66]agent>[/] ") + Text(text))

    async def _agent_respond(self) -> None:
        log = self.query_one("#log", RichLog)
        if not self.selected_model:
            log.write("[yellow]// agent is offline — pick a model (ctrl+k)[/yellow]")
            return

        self.agent_busy = True
        input_widget = self.query_one("#input", Input)
        input_widget.disabled = True
        input_widget.placeholder = "thinking…"

        try:
            reply, error = await self._stream_typed(
                messages=self.history,
                options={
                    "num_predict": 200,
                    "temperature": 0.85,
                    "top_p": 0.92,
                    "repeat_penalty": 1.2,
                    "repeat_last_n": 256,
                    "presence_penalty": 0.4,
                    "frequency_penalty": 0.3,
                },
            )
        finally:
            self.agent_busy = False
            input_widget.disabled = False
            input_widget.placeholder = "…"
            input_widget.focus()

        if error:
            log.write(f"[red]// chat failed: {error}[/red]")
            return

        reply = reply.strip()
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
        """Wait a randomized stretch, then ask the agent (LLM) to check in.

        Timing is varied to break the metronome feel: the first probe falls in
        a 35-75s window, the second (if the operator stays silent) in a longer
        80-150s window. After two probes the agent gives up rather than nagging.
        """
        windows = [(35.0, 75.0), (80.0, 150.0)]
        try:
            for low, high in windows:
                delay = random.uniform(low, high)
                await asyncio.sleep(delay)
                if self.agent_busy or not self.booted:
                    return
                await self._agent_checkin()
        except asyncio.CancelledError:
            pass

    async def _agent_checkin(self) -> None:
        if not self.selected_model:
            return
        log = self.query_one("#log", RichLog)
        input_widget = self.query_one("#input", Input)

        avoid_clause = ""
        if self._prior_checkins:
            tail = "; ".join(f'"{p}"' for p in self._prior_checkins[-3:])
            avoid_clause = f"\n- Earlier check-ins (do not echo): {tail}"

        checkin_messages = self.history + [
            {"role": "system", "content": CHECKIN_INSTRUCTION + avoid_clause},
        ]

        self.agent_busy = True
        original_placeholder = input_widget.placeholder
        try:
            reply, error = await self._stream_typed(
                messages=checkin_messages,
                options={
                    "num_predict": 60,
                    "temperature": 0.95,
                    "top_p": 0.92,
                    "repeat_penalty": 1.25,
                    "repeat_last_n": 256,
                    "presence_penalty": 0.6,
                    "frequency_penalty": 0.5,
                },
            )
        finally:
            self.agent_busy = False
            input_widget.placeholder = original_placeholder

        if error:
            return
        reply = reply.strip().strip('"')
        if not reply:
            return
        # Guard against the model defaulting to the banned phrase.
        if reply.lower().startswith("are you still"):
            return
        log.write(Text.from_markup("[bold #33ff66]agent>[/] ") + Text(reply))
        self.history.append({"role": "assistant", "content": reply})
        self._prior_checkins.append(reply)
