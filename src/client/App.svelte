<!--
  Top-level shell. Orchestrates the awakening + first triage beat.

  Beats (driven by scene.phase):
    awakening      — boot → opener → conversational chat
    triage_intro   — operator's first message has landed; side column slides
                     in, telemetry starts ticking, agent's next turn gets
                     the TRIAGE_ADDENDUM
    triage         — three status items revealed in red; operator picks one
                     (typing a name or clicking)
    acting         — picked item shifts to "working"; agent acks, then it
                     flips green after a beat
    open           — first action done; free chat

  All scene transitions live in onSend (and one in runBoot after the opener).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Header from "./components/Header.svelte";
  import Banner from "./components/Banner.svelte";
  import BootFlicker from "./components/BootFlicker.svelte";
  import ChatLog from "./components/ChatLog.svelte";
  import Input from "./components/Input.svelte";
  import SideColumn from "./components/SideColumn.svelte";
  import { chat } from "./stores/chat.svelte";
  import { ollama } from "./stores/ollama.svelte";
  import { boot } from "./stores/boot.svelte";
  import { scene } from "./stores/scene.svelte";
  import { telemetry, matchStatusItem } from "./stores/telemetry.svelte";
  import {
    AWAKENING_SYSTEM_PROMPT,
    CHECKIN_INSTRUCTION,
    TRIAGE_ADDENDUM,
    FIX_ACKNOWLEDGE_ADDENDUM,
  } from "./agent";

  const MODEL_KEY = "spaghetti.model";

  let selectedModel = $state<string | null>(null);
  let busy = $state(false);

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let priorCheckins: string[] = [];

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function readStoredModel(): string | null {
    try {
      return localStorage.getItem(MODEL_KEY);
    } catch {
      return null;
    }
  }

  $effect(() => {
    if (!selectedModel) return;
    try { localStorage.setItem(MODEL_KEY, selectedModel); } catch {}
  });

  function clearSilence(): void {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function randIn(lo: number, hi: number): number {
    return lo + Math.random() * (hi - lo);
  }

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
            priorCheckins.slice(-3).map((p) => `"${p}"`).join("; ")
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

    const stored = readStoredModel();
    const storedStillUsable =
      stored && ollama.chatModels.some((m) => m.name === stored);
    if (storedStillUsable) {
      selectedModel = stored;
    } else {
      const bySize = [...ollama.chatModels].sort(
        (a, b) => (a.size ?? Infinity) - (b.size ?? Infinity),
      );
      selectedModel = bySize[0]?.name ?? null;
    }

    boot.phase = "warm";
    if (ollama.error) {
      await chat.typeSystem(`// ollama .............. unreachable (${ollama.error})`);
    } else if (ollama.models.length === 0) {
      await chat.typeSystem("// ollama .............. no models installed");
    } else if (ollama.chatModels.length === 0) {
      await chat.typeSystem("// ollama .............. only embedding models installed");
    } else {
      await chat.typeSystem("// ollama ............... ok");
    }
    await sleep(600);

    boot.phase = "online";
    await sleep(500);

    await chat.typeAgent("Are you still there?");
    scheduleSilenceProbe(0);
  }

  /**
   * Standard chat options for an agent turn. Pulled out so the triage and
   * fix-ack turns reuse the same shape.
   */
  const AGENT_OPTS: Record<string, unknown> = {
    num_predict: 200,
    temperature: 0.85,
    top_p: 0.92,
    repeat_penalty: 1.2,
    repeat_last_n: 256,
    presence_penalty: 0.4,
    frequency_penalty: 0.3,
  };

  /**
   * Operator picked a status item — either via click on the side panel or
   * via a fuzzy name match on a typed message.
   */
  async function onPickStatus(id: string): Promise<void> {
    if (scene.phase !== "triage" || busy) return;
    const it = telemetry.statusItems.find((x) => x.id === id);
    if (!it || it.state !== "red") return;
    if (!selectedModel) return;

    scene.phase = "acting";
    telemetry.startFixing(id);
    clearSilence();

    busy = true;
    try {
      await chat.streamAgentTurn(
        selectedModel,
        AGENT_OPTS,
        FIX_ACKNOWLEDGE_ADDENDUM(id, it.label),
      );
    } finally {
      busy = false;
    }

    // Brief settle so the operator can see the working-pulse before it flips.
    await sleep(2500);
    telemetry.completeFix(id);
    scene.phase = "open";
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

    // Did the operator just pick a status item by name while we're in
    // triage? If so, route through the dedicated action flow instead of a
    // normal chat turn.
    if (scene.phase === "triage") {
      const matched = matchStatusItem(text, telemetry.statusItems);
      if (matched) {
        await onPickStatus(matched.id);
        return;
      }
    }

    // First operator message triggers the triage-intro turn.
    let addendum: string | undefined;
    if (scene.phase === "awakening") {
      scene.phase = "triage_intro";
      telemetry.start();
      addendum = TRIAGE_ADDENDUM;
    }

    busy = true;
    try {
      await chat.streamAgentTurn(selectedModel, AGENT_OPTS, addendum);
    } finally {
      busy = false;
      // After the triage-intro turn lands, reveal the red items and shift
      // the scene so subsequent input can be parsed as a pick.
      if (scene.phase === "triage_intro") {
        telemetry.revealStatus();
        scene.phase = "triage";
      }
      scheduleSilenceProbe(0);
    }
  }

  onMount(() => {
    runBoot();
    return () => {
      clearSilence();
      telemetry.stop();
    };
  });
</script>

<BootFlicker />
<div class="screen">
  <Header bind:selectedModel {busy} />
  <Banner />
  <main class="main">
    <ChatLog />
    <Input booted={boot.online} {busy} {onSend} />
  </main>
  <SideColumn onpick={onPickStatus} />
</div>

<style>
  .screen {
    display: grid;
    grid-template-columns: 1fr 22rem;
    grid-template-rows: auto auto 1fr;
    grid-template-areas:
      "header header"
      "banner side"
      "main   side";
    height: 100vh;
    gap: 0.4rem;
    padding: 0.5rem;
    background: #000;
    box-sizing: border-box;
  }
  .screen > :global(header) { grid-area: header; }
  .screen > :global(pre.banner) { grid-area: banner; }
  .main {
    grid-area: main;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 0.4rem;
    min-height: 0;
  }
  .screen > :global(aside.side) { grid-area: side; }

  @media (max-width: 720px) {
    .screen {
      grid-template-columns: 1fr;
      grid-template-areas:
        "header"
        "banner"
        "main"
        "side";
      grid-template-rows: auto auto 1fr auto;
    }
    .screen > :global(aside.side) { max-height: 40vh; }
  }
</style>
