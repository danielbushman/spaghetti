<!--
  One message in the chat log.

  Entry motion:
    user   → slides in from the right with overshoot
    agent  → slides in from the left with overshoot
    system → fades in, no horizontal motion

  While `message.typing` is true, a cursor blinks after the visible text.
-->
<script lang="ts">
  import type { Message } from "../stores/chat.svelte";
  import { onMount } from "svelte";
  import { overshoot, smooth } from "../motion/easings";
  import { burstSparks } from "../motion/sparks";
  import ThinkingIndicator from "./ThinkingIndicator.svelte";

  let { message }: { message: Message } = $props();

  let el: HTMLDivElement | undefined = $state();
  let cursorEl: HTMLSpanElement | undefined = $state();
  let cursorOn = $state(true);

  // The agent message is created with visible="" the moment a turn starts,
  // before the first token streams back. During that gap we want a visible
  // "thinking" signal *where the response will appear*, not just in the
  // header. Once the first character lands, we switch to the typing
  // cursor + sparks as today.
  const isWaitingForFirstToken = $derived(
    message.typing && message.role === "agent" && message.visible.length === 0,
  );

  // Entry motion (one-shot). The component never replays this on prop change.
  onMount(() => {
    if (!el) return;
    const startX =
      message.role === "user"  ?  18 :
      message.role === "agent" ? -18 :
                                   0;
    const duration = message.role === "system" ? 220 : 380;
    const ease = message.role === "system" ? smooth : overshoot;
    const t0 = performance.now();
    let raf = 0;

    function frame(t: number) {
      const p = Math.min(1, (t - t0) / duration);
      const e = ease(p);
      el!.style.transform = `translateX(${startX * (1 - e)}px)`;
      el!.style.opacity = String(Math.min(1, p * 1.6));
      if (p < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  });

  // Cursor blink, scoped to the typing window. The $effect cleanup runs when
  // `message.typing` flips false (or the component unmounts), so the interval
  // doesn't outlive the cursor it animates.
  $effect(() => {
    if (!message.typing) return;
    const blinker = setInterval(() => { cursorOn = !cursorOn; }, 500);
    return () => clearInterval(blinker);
  });

  // Spark particle emitter. While typing, fires bursts of 1-3 small sparks
  // every ~90-220ms at the cursor's current viewport position. The cursor
  // moves as text grows, so sparks naturally trail behind the leading edge
  // of typed prose. Sparks themselves are body-appended fire-and-forget
  // DOM nodes — see motion/sparks.ts.
  $effect(() => {
    if (!message.typing) return;
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    function tick() {
      if (!message.typing || !cursorEl) return;
      const rect = cursorEl.getBoundingClientRect();
      // Spawn slightly inset from the cursor's right edge, vertically
      // centered. Sparks then fly mostly up-and-right and arc down.
      const x = rect.right - 2;
      const y = rect.top + rect.height * 0.4;
      burstSparks(x, y);
      scheduled = setTimeout(tick, 90 + Math.random() * 130);
    }

    // Small initial delay so the first spark doesn't fire on the same
    // frame the cursor mounts.
    scheduled = setTimeout(tick, 70);
    return () => {
      if (scheduled) clearTimeout(scheduled);
    };
  });

  let prefix = $derived(
    message.role === "user"  ? "you> "  :
    message.role === "agent" ? "agent> " :
                                ""
  );

  /**
   * Split the visible text on '?' so we can wrap just the question marks
   * in spans during done-mode (the rest stays as plain text nodes — no
   * per-char overhead). Returns an array of segments where any element
   * equal to "?" is a question mark to highlight, otherwise plain text.
   *
   *   "Are you ok? Hello?" → ["Are you ok", "?", " Hello", "?"]
   */
  function splitForQuestionMarks(s: string): string[] {
    return s.split(/(\?)/).filter((p) => p.length > 0);
  }

  const doneParts = $derived(splitForQuestionMarks(message.visible));
</script>

<!--
  Two render modes, switched by `message.typing`:

  • Typing: each character is its own <span> so the CSS char-in animation
    can fire on mount, giving the leading edge a phosphor-bright
    materialize. Compound key (`${i}-${ch}`) means spans only mount on
    first arrival; mutating a char at an existing index doesn't re-fire.

  • Done: collapse to a single text node. Eliminates the per-message
    each-loop reconcile cost — important because the cursor blink causes
    this component to re-render every 500ms while typing, and old
    completed messages would otherwise carry hundreds of spans
    indefinitely (the actual cause of "typing slows down as lines
    accumulate").
-->
<!--
  In both render modes, '?' chars get the .question class so they wobble +
  glimmer. In typing mode the each-loop already produces one span per
  char; we just toggle .question on the relevant ones. In done mode we
  split the text on '?' so only the question marks become spans — the
  rest stays as plain text nodes (the whole reason for the typing/done
  split: no per-char DOM tax on completed messages).
-->
<div class="msg msg-{message.role}" bind:this={el} style="opacity: 0;"
  ><span class="prefix">{prefix}</span><span class="text"
  >{#if message.typing}{#each [...message.visible] as ch, i (`${i}-${ch}`)}<span class="char" class:question={ch === "?"} style:--i={ch === "?" ? i : null}>{ch}</span>{/each}{:else}{#each doneParts as part, i (i)}{#if part === "?"}<span class="question" style:--i={i}>?</span>{:else}{part}{/if}{/each}{/if}</span
  >{#if isWaitingForFirstToken}<ThinkingIndicator active={true} />{:else if message.typing}<span bind:this={cursorEl} class="cursor" class:on={cursorOn}>▌</span>{/if}</div>

<style>
  .msg {
    margin: 0.15rem 0;
    will-change: transform, opacity;
  }
  .msg-system {
    color: #557755;
    font-style: italic;
  }
  .msg-user .prefix { color: #66ffaa; font-weight: bold; }
  .msg-user .text   { color: #cceedd; }
  .msg-agent .prefix { color: #33ff66; font-weight: bold; }
  .msg-agent .text   { color: #33ff66; }
  /*
    Per-character phosphor materialize. Two-layer text-shadow ramps from
    blurred-bright (as if the pixel just lit) to a clean letter, on top of
    the opacity fade. Works on inline elements (no transforms / filters
    needed), so word-wrap is unchanged.

    Cost stays small in practice because the typing/done split above means
    only the actively-typing message has live .char elements; completed
    messages are static text nodes.
  */
  .char {
    animation: char-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes char-in {
    0%   { opacity: 0; text-shadow: 0 0 3px currentColor, 0 0 6px currentColor; }
    55%  { opacity: 1; text-shadow: 0 0 2px currentColor; }
    100% { opacity: 1; text-shadow: none; }
  }

  /*
    Question marks get a slimy wobble + a periodic glimmer.

    .question        used in done-mode (just wobble + glimmer)
    .char.question   used in typing-mode (char-in materialize PLUS the
                     wobble + glimmer)

    Per-instance phase is set via the --i custom property (the char's
    position index in the message). Two non-harmonic delay multipliers
    (-127ms and -89ms) mean wobble and glimmer drift independently
    across multiple question marks in the same message.

    display: inline-block is required because we use transform on the
    wobble. Question marks are atomic boxes; word-wrap is unaffected
    because line break opportunities sit between inline-blocks at
    whitespace, just like between regular inlines.
  */
  .question, .char.question {
    display: inline-block;
    color: #aaffaa;
    vertical-align: baseline;
    will-change: transform, color, text-shadow;
  }
  .question {
    animation:
      question-wobble 2.8s ease-in-out infinite,
      question-glimmer 1.8s ease-in-out infinite;
    animation-delay:
      calc(var(--i, 0) * -127ms),
      calc(var(--i, 0) * -89ms);
  }
  .char.question {
    /*
      Three stacked animations. char-in fires once on mount (no delay);
      wobble and glimmer loop forever with their own per-instance phase.
    */
    animation:
      char-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both,
      question-wobble 2.8s ease-in-out infinite,
      question-glimmer 1.8s ease-in-out infinite;
    animation-delay:
      0ms,
      calc(var(--i, 0) * -127ms),
      calc(var(--i, 0) * -89ms);
  }

  @keyframes question-wobble {
    /* Subtle rotation + skew + asymmetric scale → "slimy" feel. Mean
       transform is identity-ish, but each keyframe deforms slightly
       differently so the character never sits still. */
    0%   { transform: rotate(-1.5deg) skewY(0.4deg) scale(1.00, 1.00); }
    22%  { transform: rotate(1.0deg)  skewY(-0.8deg) scale(1.05, 0.94); }
    45%  { transform: rotate(-0.5deg) skewY(0.0deg) scale(0.95, 1.05); }
    68%  { transform: rotate(2.0deg)  skewY(0.6deg) scale(1.03, 0.97); }
    85%  { transform: rotate(-1.0deg) skewY(-0.4deg) scale(0.98, 1.03); }
    100% { transform: rotate(-1.5deg) skewY(0.4deg) scale(1.00, 1.00); }
  }

  @keyframes question-glimmer {
    /* Brightness pulse — base mint-green to bright white-green with a
       soft halo. Stays within reading range. */
    0%, 100% {
      color: #aaffaa;
      text-shadow: 0 0 2px rgba(170, 255, 170, 0.4);
    }
    50% {
      color: #e0ffd8;
      text-shadow:
        0 0 8px rgba(204, 255, 200, 0.85),
        0 0 18px rgba(100, 255, 130, 0.4);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .char { animation: none; }
    .question, .char.question {
      animation: none !important;
      transform: none !important;
      color: #aaffaa;
      text-shadow: 0 0 4px rgba(170, 255, 170, 0.5);
    }
  }
  .cursor {
    color: #33ff66;
    opacity: 0;
    transition: opacity 120ms;
    margin-left: 0.05em;
  }
  .cursor.on { opacity: 1; }
</style>
