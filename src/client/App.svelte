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
  import BootFlicker from "./components/BootFlicker.svelte";
  import ChatLog from "./components/ChatLog.svelte";
  import Input from "./components/Input.svelte";
  import SideColumn from "./components/SideColumn.svelte";
  import { chat } from "./stores/chat.svelte";
  import { ollama } from "./stores/ollama.svelte";
  import { boot } from "./stores/boot.svelte";
  import { scene } from "./stores/scene.svelte";
  import { telemetry, matchStatusItem } from "./stores/telemetry.svelte";
  import { speed } from "./stores/speed.svelte";
  import { work } from "./stores/work.svelte";
  import {
    AWAKENING_SYSTEM_PROMPT,
    CHECKIN_INSTRUCTION,
    TRIAGE_ADDENDUM,
    FIX_ACKNOWLEDGE_ADDENDUM,
    AUTO_PICK_ADDENDUM,
  } from "./agent";
  import { logEvent, sessionId } from "./log";

  const MODEL_KEY = "spaghetti.model";

  let selectedModel = $state<string | null>(null);
  let busy = $state(false);

  /**
   * Pending operator inputs. Filled by onSend while busy, drained one at a
   * time by an $effect when busy flips false. Each entry becomes its own
   * agent turn — the operator sees the queued user line in the chat log
   * immediately, but the LLM call is deferred until the previous turn
   * completes (cf. Claude Code's queueing).
   */
  let pendingTexts = $state<string[]>([]);

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let priorCheckins: string[] = [];

  /**
   * Auto-pick timer. Started when scene enters triage; if the operator
   * hasn't picked an item by the time it fires, the agent picks halberd-
   * monitor for them (the bleeder, the stated default). True idler — if
   * the operator just chats around the choice, the agent makes it and
   * moves forward. Decision is amplification, not a gate.
   */
  let autoPickTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTO_PICK_DEFAULT_ID = "halberd-monitor";

  function clearAutoPick(): void {
    if (autoPickTimer !== null) {
      clearTimeout(autoPickTimer);
      autoPickTimer = null;
    }
  }

  function scheduleAutoPick(): void {
    clearAutoPick();
    // Randomized 30-60s window so the auto-pick doesn't feel mechanical.
    // Short enough for an idle operator to feel the game moving; long
    // enough that someone reading the triage message has time to respond.
    const delay = 30_000 + Math.random() * 30_000;
    autoPickTimer = setTimeout(runAutoPick, delay);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Speed-scaled sleep. The slider's multiplier applies to every paced
   * delay in the boot sequence + post-boot game loop. Read at the
   * moment of sleep so changes to the slider take effect immediately.
   */
  function speedSleep(ms: number): Promise<void> {
    return sleep(ms * speed.multiplier);
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
    // First event seals the session ID into the on-disk filename and
    // gives the analyst something to grep for.
    logEvent({
      type: "session_start",
      session_id: sessionId(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      app_started_at: new Date().toISOString(),
    });

    chat.setSystemPrompt(AWAKENING_SYSTEM_PROMPT);
    boot.phase = "cold";
    await speedSleep(600);

    // Boot text uses the internal codename ('ghetti'); the user-facing
    // docs are the only place 'Ollama' is named.
    const lines: Array<readonly [string, number]> = [
      ["// system: cold boot detected",          350],
      ["// memory ............... ok",           250],
      ["// agent core ........... loading",      400],
      ["// agent core ........... ok",           250],
      ["// ghetti: handshake ...",                 0],
    ];
    for (const [line, pause] of lines) {
      await chat.typeSystem(line);
      if (pause) await speedSleep(pause);
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
      await chat.typeSystem(`// ghetti .............. unreachable (${ollama.error})`);
    } else if (ollama.models.length === 0) {
      await chat.typeSystem("// ghetti .............. no models installed");
    } else if (ollama.chatModels.length === 0) {
      await chat.typeSystem("// ghetti .............. only embedding models installed");
    } else {
      await chat.typeSystem("// ghetti ............... ok");
    }
    await speedSleep(600);

    boot.phase = "online";
    logEvent({
      type: "boot_online",
      model: selectedModel,
      models_available: ollama.chatModels.length,
    });
    // Start the agent's "anxiety" — never sit idle after this point.
    work.start();
    await speedSleep(500);

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
   * Core fix-flow: agent acknowledges (or commits to) a pick, the item
   * pulses amber, and after a settle interval flips green. Both manual
   * picks and auto-picks route through this. The addendum and settle
   * time differ — manual picks feel sharper because the operator's
   * decision amplifies the system.
   */
  async function runFixFlow(
    id: string,
    addendum: string,
    settleMs: number,
  ): Promise<void> {
    if (scene.phase !== "triage" && scene.phase !== "triage_intro") return;
    if (busy) return;
    const it = telemetry.statusItems.find((x) => x.id === id);
    if (!it || it.state !== "red") return;
    if (!selectedModel) return;

    clearAutoPick();
    scene.phase = "acting";
    logEvent({ type: "scene_phase", phase: "acting", picked: id });
    telemetry.startFixing(id);
    clearSilence();

    busy = true;
    try {
      await chat.streamAgentTurn(selectedModel, AGENT_OPTS, addendum);
    } finally {
      busy = false;
    }

    await speedSleep(settleMs);
    telemetry.completeFix(id);
    scene.phase = "open";
    logEvent({ type: "scene_phase", phase: "open", resolved: id });
    scheduleSilenceProbe(0);
  }

  /**
   * Operator picked a status item — either via click on the side panel
   * or via a fuzzy name match on a typed message. Manual pick: 2.2s
   * fix animation (snappier — the operator decided).
   */
  async function onPickStatus(id: string): Promise<void> {
    const it = telemetry.statusItems.find((x) => x.id === id);
    if (!it) return;
    logEvent({ type: "pick_status", id, trigger: "manual" });
    await runFixFlow(id, FIX_ACKNOWLEDGE_ADDENDUM(id, it.label), 2200);
  }

  /**
   * Auto-pick: the agent moves forward on the stated default
   * (halberd-monitor) because the operator hasn't redirected. Slightly
   * slower fix animation (3.5s) than a manual pick — small visible
   * difference, signals that operator decisions amplify the system.
   *
   * Defers if busy (e.g. mid-stream of another turn) — retries shortly.
   * Bails cleanly if the scene has moved on (operator picked something
   * else just as the timer fired, etc).
   */
  async function runAutoPick(): Promise<void> {
    autoPickTimer = null;
    if (scene.phase !== "triage") return;
    if (busy) {
      autoPickTimer = setTimeout(runAutoPick, 3000 + Math.random() * 2000);
      return;
    }
    const target = telemetry.statusItems.find(
      (x) => x.id === AUTO_PICK_DEFAULT_ID && x.state === "red",
    );
    if (!target) return;
    logEvent({ type: "pick_status", id: target.id, trigger: "auto" });
    await runFixFlow(
      target.id,
      AUTO_PICK_ADDENDUM(target.id, target.label),
      3500,
    );
  }

  /**
   * Operator input entry point. Always shows the message in the chat log
   * immediately. If the agent is busy, queues the text for later dispatch;
   * otherwise dispatches now. The dispatcher decides between "pick" and
   * "chat" based on scene state *at dispatch time*, so a message queued
   * during triage_intro will still be routed correctly when the scene has
   * advanced to triage by the time it dispatches.
   */
  async function onSend(text: string): Promise<void> {
    if (!boot.online) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    // Show the message in the log immediately so the operator can see
    // their queued lines. pushUserInstant also adds to chat.history, so the
    // LLM will see all queued user turns when it next gets called.
    chat.pushUserInstant(trimmed);

    if (busy) {
      pendingTexts = [...pendingTexts, trimmed];
      return;
    }

    await dispatch(trimmed);
  }

  /**
   * Handle one operator input. Sets busy=true synchronously at the top so
   * the drain $effect won't fire another dispatch concurrently.
   */
  async function dispatch(text: string): Promise<void> {
    clearSilence();

    if (!selectedModel) {
      await chat.typeSystem("// agent is offline — pick a model from the header");
      scheduleSilenceProbe(0);
      return;
    }

    // Triage pick by typed name routes through the action flow.
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
      logEvent({ type: "scene_phase", phase: "triage_intro" });
      telemetry.start();
      addendum = TRIAGE_ADDENDUM;
    }

    busy = true;
    try {
      await chat.streamAgentTurn(selectedModel, AGENT_OPTS, addendum);
    } finally {
      busy = false;
      if (scene.phase === "triage_intro") {
        telemetry.revealStatus();
        scene.phase = "triage";
        logEvent({ type: "scene_phase", phase: "triage" });
        // Start the auto-pick countdown the moment status items are
        // revealed. Cancelled by any subsequent pick (manual or auto).
        scheduleAutoPick();
      }
      scheduleSilenceProbe(0);
    }
  }

  /**
   * Drain the queue when the agent finishes a turn. Pulls the next input
   * and dispatches it. The dispatch sets busy=true synchronously, so this
   * effect won't re-fire mid-flight.
   */
  $effect(() => {
    if (busy) return;
    if (pendingTexts.length === 0) return;
    const next = pendingTexts[0];
    pendingTexts = pendingTexts.slice(1);
    dispatch(next);
  });

  onMount(() => {
    runBoot();
    return () => {
      clearSilence();
      clearAutoPick();
      telemetry.stop();
      work.stop();
    };
  });
</script>

<BootFlicker />
<div class="screen">
  <Header bind:selectedModel {busy} />
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
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "header header"
      "main   side";
    height: 100vh;
    gap: 0.4rem;
    padding: 0.5rem;
    background: #000;
    box-sizing: border-box;
  }
  .screen > :global(header) { grid-area: header; }
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
        "main"
        "side";
      grid-template-rows: auto 1fr auto;
    }
    .screen > :global(aside.side) { max-height: 40vh; }
  }
</style>
