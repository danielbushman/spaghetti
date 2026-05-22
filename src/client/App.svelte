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
  import PhotosensitivityWarning from "./components/PhotosensitivityWarning.svelte";
  import Goodbye from "./components/Goodbye.svelte";
  import ABIndicator from "./components/ABIndicator.svelte";
  import { chat } from "./stores/chat.svelte";
  import { ollama } from "./stores/ollama.svelte";
  import { boot } from "./stores/boot.svelte";
  import { scene } from "./stores/scene.svelte";
  import { telemetry, matchStatusItem } from "./stores/telemetry.svelte";
  import { speed } from "./stores/speed.svelte";
  import { work } from "./stores/work.svelte";
  import { font } from "./stores/font.svelte";
  import { effects } from "./stores/effects.svelte";
  import { loop } from "./stores/loop.svelte";
  import { abtest } from "./stores/abtest.svelte";
  import { audioEngine, syncAudioStoreToEngine } from "./audio";
  import {
    AWAKENING_SYSTEM_PROMPT,
    CHECKIN_INSTRUCTION,
    TRIAGE_ADDENDUM,
    FIX_ACKNOWLEDGE_ADDENDUM,
    AUTO_PICK_ADDENDUM,
  } from "./agent";
  import { logEvent, sessionId, resetSessionId } from "./log";

  const MODEL_KEY = "spaghetti.model";

  /**
   * Gate state. Shown before anything else mounts:
   *   warning — photosensitivity gate; any key → game, Esc → goodbye
   *   game    — normal boot + scene flow
   *   goodbye — black screen with grey 'goodbye'; no way back without reload
   *
   * The boot sequence (and everything else that runs on mount) is
   * deferred until gateState flips to 'game'.
   */
  let gateState = $state<"warning" | "game" | "goodbye">("warning");

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
   * Session counter for the soft-restart flow. runBoot captures the
   * current value at start; subsequent restart() calls increment it,
   * which makes the in-flight runBoot's captured value stale — the
   * `aborted()` check at every await bails out gracefully. Without
   * this, the old runBoot would keep advancing boot.phase /
   * scene.phase after we reset them, racing the new runBoot.
   */
  let bootSession = 0;

  /**
   * Remount key for BootFlicker. Bumped on every restart so the boot
   * subtree unmounts and remounts cleanly — that re-runs the CSS
   * keyframes (flicker scrim, electric overlay, spaghetti afterimage)
   * and re-schedules the onMount setTimeouts that fire flare bursts
   * and 3D-positioned audio cues.
   *
   * Without this, a loop-driven autoContinue restart (which doesn't
   * transition gateState through "warning") would leave BootFlicker
   * mounted, its keyframes already complete and its setTimeouts
   * already fired — the operator would see runBoot replay the typed
   * text into a black screen with no flicker, no flares, no sound.
   */
  let bootKey = $state(0);

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
    // Scaled by speed.multiplier for the global time-warp setting.
    const delay = (30_000 + Math.random() * 30_000) * speed.multiplier;
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

  // Push the chosen font family onto a CSS custom property so the
  // global body rule picks it up. Reading `font.current.family`
  // registers the dependency; the effect re-runs whenever the operator
  // picks a different font in the header dropdown.
  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--font-mono", font.current.family);
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
    // Scale by speed.multiplier — at 200× the 35-75s window becomes
    // 175-375ms. The model itself can't be sped up but the *wait
    // before* invoking it is just a setTimeout, so it scales.
    const delay = randIn(window[0], window[1]) * speed.multiplier;
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
      const mySession = bootSession;
      busy = true;
      let result: string | null = null;
      try {
        result = await chat.streamCheckin(
          selectedModel,
          CHECKIN_INSTRUCTION + avoid,
        );
      } finally {
        busy = false;
      }
      if (mySession !== bootSession) return; // restart() fired during check-in
      if (result) priorCheckins.push(result);
      scheduleSilenceProbe(round + 1);
    }, delay);
  }

  async function runBoot(): Promise<void> {
    const mySession = ++bootSession;
    const aborted = () => mySession !== bootSession;

    // First event seals the session ID into the on-disk filename and
    // gives the analyst something to grep for.
    logEvent({
      type: "session_start",
      session_id: sessionId(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      app_started_at: new Date().toISOString(),
    });

    chat.setSystemPrompt(AWAKENING_SYSTEM_PROMPT);
    if (aborted()) return;
    boot.phase = "cold";
    await speedSleep(600);
    if (aborted()) return;

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
      if (aborted()) return;
      if (pause) await speedSleep(pause);
      if (aborted()) return;
    }

    await ollama.refresh();
    if (aborted()) return;

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
    if (aborted()) return;
    await speedSleep(600);
    if (aborted()) return;

    boot.phase = "online";
    logEvent({
      type: "boot_online",
      model: selectedModel,
      models_available: ollama.chatModels.length,
    });
    // Start the agent's "anxiety" — never sit idle after this point.
    work.start();
    await speedSleep(500);
    if (aborted()) return;

    // Buddy-after-an-accident phrasing — subtly hints that the heart
    // of the game is about being alive. Same opener spot, different
    // tone than the old "Are you still there?".
    await chat.typeAgent("Are you alive?");
    if (aborted()) return;
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

    const mySession = bootSession;

    clearAutoPick();
    scene.phase = "acting";
    logEvent({ type: "scene_phase", phase: "acting", picked: id });
    telemetry.startFixing(id);
    // Status state-change punctuation: brief screen mute + light pulse.
    // The id makes the affected status item spotlight itself harder than
    // the surrounding dim.
    effects.flash(id);
    clearSilence();

    busy = true;
    try {
      await chat.streamAgentTurn(selectedModel, AGENT_OPTS, addendum);
    } finally {
      busy = false;
    }
    if (mySession !== bootSession) return; // restart() fired during stream

    await speedSleep(settleMs);
    if (mySession !== bootSession) return;
    telemetry.completeFix(id);
    // Same punctuation on the working → green transition; same id so
    // the resolving item gets spotlit a second time as it lands.
    effects.flash(id);
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
      // Retry while busy — also speed-scaled so it tracks the global setting.
      autoPickTimer = setTimeout(
        runAutoPick,
        (3000 + Math.random() * 2000) * speed.multiplier,
      );
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
        // Each item's reveal is the operator's "first becoming aware"
        // moment for that task — fire a dramatic flash so the item
        // pops toward the camera while the rest of the scene dims.
        telemetry.revealStatus((id) => effects.flash(id));
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

  async function onWarningContinue(): Promise<void> {
    if (gateState !== "warning") return;
    // Resume the AudioContext now — this is the first user gesture
    // (key press or click on the warning), which browsers require
    // before any sound can play. Sync the persisted mute/volume
    // state into the engine once it's live.
    await audioEngine.resume();
    syncAudioStoreToEngine();
    gateState = "game";
    // Mark the current instant as the start of this run, so the loop
    // tick can measure elapsed time from a known reference.
    loop.markRunStart();
    // runBoot starts the typed boot sequence + scene state machine.
    // Deferred until now so the user doesn't see flicker/flash before
    // they've consented past the photosensitivity gate.
    runBoot();
  }

  function onWarningOptOut(): void {
    if (gateState !== "warning") return;
    gateState = "goodbye";
  }

  /**
   * Soft restart. Equivalent to reloading the browser except fullscreen
   * state is preserved (a real reload exits fullscreen).
   *
   * - Logs a session_restart marker so analysis can see the boundary.
   * - Resets the session ID so the next logEvent opens a fresh JSONL
   *   file on the server (parity with what a real reload does).
   * - Bumps bootSession to abort any in-flight runBoot.
   * - Clears local timers + state.
   * - Resets all game-state stores back to their initial values.
   * - Bounces the gate back to "warning" — same flow a real reload
   *   would land on. Operator presses any key to continue into a
   *   freshly-booted game.
   *
   * User preferences (selectedModel via localStorage, speed.multiplier,
   * font.current) are untouched — same as how localStorage survives a
   * real reload.
   *
   * `autoContinue` skips the photosensitivity gate and goes straight
   * back into runBoot. Used by the replay-loop tick — the warning
   * has already been acknowledged in this tab; bouncing back to it
   * every loop cycle would block the loop.
   */
  function restart(opts: { autoContinue?: boolean } = {}): void {
    logEvent({ type: "session_restart" });
    resetSessionId();
    bootSession++; // invalidates the in-flight runBoot, if any
    clearSilence();
    clearAutoPick();
    busy = false;
    pendingTexts = [];
    priorCheckins = [];
    boot.reset();
    scene.reset();
    chat.reset();
    telemetry.reset();
    work.reset();
    effects.reset();
    // Force BootFlicker to remount so its CSS keyframes + onMount
    // schedulers (flare bursts, audio cues) run fresh. Needed for
    // autoContinue, and harmless for the normal warning-gate path
    // (which already gets a remount via the {#if/else} swap).
    bootKey++;
    if (opts.autoContinue) {
      gateState = "game";
      loop.markRunStart();
      runBoot();
    } else {
      gateState = "warning";
    }
  }

  onMount(() => {
    // No runBoot() here — that fires only when the warning is dismissed
    // via onWarningContinue. Cleanup still runs on unmount regardless.

    // F2 = global soft-restart shortcut. Works in any state (warning,
    // game, goodbye). Doesn't conflict with browser shortcuts; F-keys
    // are rarely used by the browser itself other than F11/F12. The
    // game's text inputs don't intercept F2, so it works while the
    // operator is typing too.
    function onGlobalKeyDown(e: KeyboardEvent): void {
      if (e.key === "F2") {
        e.preventDefault();
        restart();
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);

    // Replay-loop tick. Every 250ms while the game is live, check
    // whether wall-clock elapsed has crossed the captured marker; if
    // so, soft-restart with autoContinue so the same beat replays.
    // No-op while the gate is showing (the warning blocks the run)
    // or when no loop is set.
    const loopTick = setInterval(() => {
      if (gateState !== "game") return;
      const target = loop.targetMs;
      if (target === null) return;
      if (loop.getElapsed() >= target) {
        // If A/B compare is active, swap sides *before* the restart
        // so the new cycle (with the freshly-remounted BootFlicker
        // and freshly-scheduled audio cues) hears the new variant.
        if (abtest.mode === "active") abtest.flip();
        restart({ autoContinue: true });
      }
    }, 250);

    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
      clearInterval(loopTick);
      clearSilence();
      clearAutoPick();
      telemetry.stop();
      work.stop();
      effects.stop();
    };
  });
</script>

{#if gateState === "warning"}
  <PhotosensitivityWarning
    onContinue={onWarningContinue}
    onOptOut={onWarningOptOut}
  />
{:else if gateState === "goodbye"}
  <Goodbye />
{:else}
  {#key bootKey}
    <BootFlicker />
  {/key}
  <!--
    A/B-compare side indicator. Sits above the scene at z 300, below
    the BlinkingLight (z 250 in scene context) and below modals, but
    above the chat/header. Only renders when abtest.mode === 'active'
    (component handles the gate internally) and is purely visual —
    pointer-events: none.
  -->
  <ABIndicator />
  <!--
    Status-change flash overlay. Sits above the scene (z 200), under
    the BlinkingLight (z 250) so the light visibly pulses while the
    rest dims. Fast fade in (70ms ease-out), slower fade out (250ms).
  -->
  <div class="status-flash" class:active={effects.flashing}></div>
  <div class="screen">
    <Header bind:selectedModel {busy} onrestart={restart} />
    <main class="main">
      <ChatLog />
      <Input booted={boot.online} {busy} {onSend} />
    </main>
    <SideColumn onpick={onPickStatus} />
  </div>
{/if}

<style>
  /*
    Status-flash scrim. The scrim now stays much darker and longer
    than the original "split-second flash" — it's a sustained
    moment-of-awareness, not a punctuation event. With multiple
    overlapping flashes (e.g. the staggered initial reveal) the
    overlay stays on for the union of all active flash windows,
    fading back when the last one expires.

    Slower asymmetric timing too: ~280ms in, ~450ms out. Deliberate
    rather than reflexive.
  */
  .status-flash {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 200;
    background: #000;
    opacity: 0;
    transition: opacity 450ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .status-flash.active {
    opacity: 0.68;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

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
