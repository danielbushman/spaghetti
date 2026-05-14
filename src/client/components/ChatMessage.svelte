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
  //
  // We track BOTH message.typing AND cursorEl at the effect-body level
  // so Svelte registers them as dependencies. Streaming agent turns
  // show the ThinkingIndicator (not the cursor) while waiting for the
  // first token — cursorEl is undefined during that gap. When the
  // first token arrives the cursor mounts; reading cursorEl here means
  // the effect re-runs at that moment and starts the spark loop. If we
  // only read cursorEl inside the setTimeout callback (as before), the
  // dependency isn't tracked and the loop stays dead forever.
  $effect(() => {
    if (!message.typing) return;
    const el = cursorEl;
    if (!el) return;

    let scheduled: ReturnType<typeof setTimeout> | null = null;

    function tick() {
      if (!message.typing) return;
      const rect = el!.getBoundingClientRect();
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
  Question marks are wrapped in a nested span: the outer carries the
  wobble + glimmer, the inner carries the rubber-band snap. Two CSS
  animations on the same property would compete (last-defined wins),
  so splitting onto two elements lets their transforms compose via the
  DOM parent-child relationship.

  In both render modes, regular characters use the simpler single
  span. The '?' branches do the wrapping.
-->
<div class="msg msg-{message.role}" bind:this={el} style="opacity: 0;"
  ><span class="prefix">{prefix}</span><span class="text"
  >{#if message.typing}{#each [...message.visible] as ch, i (`${i}-${ch}`)}{#if ch === "?"}<span class="char question" style:--i={i}><span class="snap">{ch}</span></span>{:else}<span class="char">{ch}</span>{/if}{/each}{:else}{#each doneParts as part, i (i)}{#if part === "?"}<span class="question" style:--i={i}><span class="snap">?</span></span>{:else}{part}{/if}{/each}{/if}</span
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
    color: #88ee88;
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
    /* Rotation + skew + asymmetric scale + translateY bob → "slime in
       motion" feel. Bigger amplitudes than first pass so it's visible
       from across the chat panel. translateY makes the character bob
       in and out of the baseline, like it's floating in goo. */
    0%   { transform: rotate(-3deg) skewY(1deg)    scale(1.00, 1.00) translateY(0); }
    20%  { transform: rotate(4deg)  skewY(-2deg)   scale(1.12, 0.88) translateY(-2.5px); }
    45%  { transform: rotate(-2deg) skewY(0.5deg)  scale(0.90, 1.13) translateY(1.5px); }
    68%  { transform: rotate(5deg)  skewY(2deg)    scale(1.10, 0.93) translateY(-1px); }
    85%  { transform: rotate(-1deg) skewY(-1deg)   scale(0.94, 1.09) translateY(1px); }
    100% { transform: rotate(-3deg) skewY(1deg)    scale(1.00, 1.00) translateY(0); }
  }

  @keyframes question-glimmer {
    /* Punchier pulse. Base is a saturated slime green; peak goes
       brighter (cream-green) with a much stronger halo so the
       character clearly *glows* at the bright moment. */
    0%, 100% {
      color: #88ee88;
      text-shadow:
        0 0 3px rgba(140, 240, 140, 0.55),
        0 0 6px rgba(100, 220, 130, 0.25);
    }
    50% {
      color: #f5ffe0;
      text-shadow:
        0 0 14px rgba(220, 255, 200, 1),
        0 0 32px rgba(120, 255, 130, 0.6);
    }
  }

  /*
    Rubber-band snap. Inner span owns this so it composes on top of
    the outer wobble/glimmer (two animations on the same property
    would otherwise compete — last-defined wins).

    transform-origin: bottom center → the character stretches *upward*
    from its baseline (as if pulled by its top), snaps back through
    baseline, then oscillates to rest.

    4-second cycle period. ~12% of the cycle is the actual snap event;
    the rest holds at identity. Per-instance offset via --i × 311ms
    (non-harmonic with the outer's 127ms and 89ms offsets) so multiple
    question marks never snap simultaneously.
  */
  .question .snap,
  .char.question .snap {
    display: inline-block;
    transform-origin: bottom center;
    animation: question-snap 4s infinite;
    animation-delay: calc(var(--i, 0) * -311ms);
    will-change: transform;
  }

  @keyframes question-snap {
    /* Long rest, ease-in-cubic for the tension buildup. */
    0%, 87.5% {
      transform: scaleY(1);
      animation-timing-function: cubic-bezier(0.55, 0.06, 0.68, 0.19);
    }
    /* Pull complete at peak. step-end holds 1.85× until the snap. */
    92% {
      transform: scaleY(1.85);
      animation-timing-function: step-end;
    }
    /* THE SNAP — value jumps from 1.85 to 0.55 at this boundary. */
    94% {
      transform: scaleY(0.55);
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }
    /* Damped oscillation back to identity. */
    95%  { transform: scaleY(1.25); animation-timing-function: ease-in-out; }
    96%  { transform: scaleY(0.85); animation-timing-function: ease-in-out; }
    97%  { transform: scaleY(1.08); animation-timing-function: ease-in-out; }
    98%  { transform: scaleY(0.96); animation-timing-function: ease-in-out; }
    99%  { transform: scaleY(1.02); animation-timing-function: ease-out; }
    100% { transform: scaleY(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .char { animation: none; }
    .question, .char.question,
    .question .snap, .char.question .snap {
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
