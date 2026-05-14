<!--
  Top-level shell.

  Orchestrates the awakening scene:
    1. Boot sequence (typed system lines, cold → warm → online color states).
    2. Hardcoded agent opener — "Are you still there?"
    3. Streamed user turns via /api/chat.
    4. Silence probe: at randomized windows of silence, ask the LLM to
       generate an in-character check-in (with prior check-ins as avoid-list).
       Two check-ins max per silent stretch.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Header from "./components/Header.svelte";
  import Banner from "./components/Banner.svelte";
  import ChatLog from "./components/ChatLog.svelte";
  import Input from "./components/Input.svelte";
  import { chat } from "./stores/chat.svelte";
  import { ollama } from "./stores/ollama.svelte";
  import { boot } from "./stores/boot.svelte";
  import { AWAKENING_SYSTEM_PROMPT, CHECKIN_INSTRUCTION } from "./agent";

  let selectedModel = $state<string | null>(null);
  let busy = $state(false);

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let priorCheckins: string[] = [];

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clearSilence(): void {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function randIn(lo: number, hi: number): number {
    return lo + Math.random() * (hi - lo);
  }

  /**
   * Schedules the next silence check-in. After `round` triggers in a row
   * without operator input we stop probing (no nagging).
   *
   * Windows match the Python TUI: 35-75s for the first probe, 80-150s for
   * the second. Randomized to break the metronome feel.
   */
  function scheduleSilenceProbe(round: number): void {
    clearSilence();
    if (round >= 2) return;
    const window = round === 0 ? [35_000, 75_000] : [80_000, 150_000];
    const delay = randIn(window[0], window[1]);
    silenceTimer = setTimeout(async () => {
      if (busy || !boot.online || !selectedModel) {
        scheduleSilenceProbe(round + 1);
        return;
      }
      const avoid =
        priorCheckins.length > 0
          ? `\n- Earlier check-ins (do not echo): ` +
            priorCheckins
              .slice(-3)
              .map((p) => `"${p}"`)
              .join("; ")
          : "";
      busy = true;
      try {
        const result = await chat.streamCheckin(
          selectedModel,
          CHECKIN_INSTRUCTION + avoid,
        );
        if (result) priorCheckins.push(result);
      } finally {
        busy = false;
      }
      scheduleSilenceProbe(round + 1);
    }, delay);
  }

  async function runBoot(): Promise<void> {
    chat.setSystemPrompt(AWAKENING_SYSTEM_PROMPT);
    boot.phase = "cold";
    await sleep(600);

    const lines: Array<readonly [string, number]> = [
      ["// system: cold boot detected",          350],
      ["// memory ............... ok",           250],
      ["// agent core ........... loading",      400],
      ["// agent core ........... ok",           250],
      ["// ollama: handshake ...",                 0],
    ];
    for (const [line, pause] of lines) {
      await chat.typeSystem(line);
      if (pause) await sleep(pause);
    }

    await ollama.refresh();
    if (ollama.models.length > 0 && !selectedModel) {
      selectedModel = ollama.models[0].name;
    }

    boot.phase = "warm";
    if (ollama.error) {
      await chat.typeSystem(`// ollama .............. unreachable (${ollama.error})`);
      await sleep(600);
    } else if (ollama.models.length === 0) {
      await chat.typeSystem("// ollama .............. no models installed");
      await sleep(600);
    } else {
      await chat.typeSystem("// ollama ............... ok");
      await sleep(600);
    }

    boot.phase = "online";
    await sleep(500);

    await chat.typeAgent("Are you still there?");
    scheduleSilenceProbe(0);
  }

  async function onSend(text: string): Promise<void> {
    if (!boot.online || busy) return;
    clearSilence();
    chat.pushUserInstant(text);
    if (!selectedModel) {
      await chat.typeSystem("// agent is offline — pick a model");
      scheduleSilenceProbe(0);
      return;
    }
    busy = true;
    try {
      await chat.streamAgentTurn(selectedModel, {
        num_predict: 200,
        temperature: 0.85,
        top_p: 0.92,
        repeat_penalty: 1.2,
        repeat_last_n: 256,
        presence_penalty: 0.4,
        frequency_penalty: 0.3,
      });
    } finally {
      busy = false;
      scheduleSilenceProbe(0);
    }
  }

  onMount(() => {
    runBoot();
    return () => clearSilence();
  });
</script>

<div class="screen">
  <Header bind:selectedModel {busy} />
  <Banner />
  <ChatLog />
  <Input booted={boot.online} {busy} {onSend} />
</div>

<style>
  .screen {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
    gap: 0.4rem;
    padding: 0.5rem;
    background: #000;
    box-sizing: border-box;
  }
</style>
