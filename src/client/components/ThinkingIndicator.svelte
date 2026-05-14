<!--
  Two render modes:

    full      (default) — three detuned oscillators drive opacity/scale/glow
                          for a richly alive indicator. Use this inline at
                          the edge of the conversation, where the operator
                          is already looking and the agent is about to speak.

    subtle    (header)  — rotating Braille glyph + plain label. Same
                          vocabulary as a CLI tool, no oscillators, doesn't
                          grab attention. Right for ambient signals like the
                          work-tools rotation in the header.

  Layout is identical in both modes; only the per-frame styling differs.

  Full-mode oscillators (motion library easings):
    letter wave   breathe   1600ms   per-letter phase offset 0.10
    spinner scale breathe   1400ms   1.00 → 1.06 → 1.00
    glow blur     overshoot 1100ms   4 → 12.7px, double-pulse per cycle
  Periods are non-harmonic (1600/1400/1100) so the three never align.
-->
<script lang="ts">
  import { breathe, overshoot } from "../motion/easings";

  let {
    active = false,
    label = "thinking",
    subtle = false,
  }: {
    active: boolean;
    label?: string;
    subtle?: boolean;
  } = $props();

  const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  let frame = $state(0);
  let elapsed = $state(0);

  $effect(() => {
    if (!active) {
      frame = 0;
      elapsed = 0;
      return;
    }
    const start = performance.now();
    let lastSpin = start;
    let raf = 0;

    function tick(t: number) {
      // Always advance elapsed — the full-mode oscillators read it.
      // Cheap when subtle is true (no template reads compute on it).
      elapsed = t - start;
      if (t - lastSpin >= 80) {
        frame = (frame + 1) % FRAMES.length;
        lastSpin = t;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  /** 0 → 1 → 0 triangle wave with period 1. */
  function triangle(t: number): number {
    return 1 - Math.abs((t % 1) * 2 - 1);
  }

  function letterOpacity(i: number): number {
    const T = 1600;
    const phase = i * 0.10;
    return 0.45 + 0.55 * breathe(triangle(elapsed / T + phase));
  }

  function spinnerScale(): number {
    const T = 1400;
    return 1 + 0.06 * breathe(triangle(elapsed / T));
  }

  function glowPx(): number {
    const T = 1100;
    return 4 + 8 * overshoot(triangle(elapsed / T));
  }

  const labelChars = $derived([...label]);
</script>

{#if active}
  <span class="thinking" class:subtle role="status" aria-live="polite" aria-label="agent is {label}">
    <span
      class="spinner"
      style={subtle
        ? ""
        : `transform: scale(${spinnerScale()}); text-shadow: 0 0 ${glowPx()}px currentColor;`}
      aria-hidden="true"
    >{FRAMES[frame]}</span>
    {#if subtle}
      <span class="label">{label}</span>
    {:else}
      <span class="label"
        >{#each labelChars as ch, i (i)}<span class="letter" style="opacity: {letterOpacity(i)}">{ch}</span>{/each}</span
      >
    {/if}
  </span>
{/if}

<style>
  .thinking {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #ffaa33;
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  /* Subtle: dimmer color, no glow / pulse / wave. */
  .thinking.subtle {
    color: #8a6622;
    font-weight: normal;
    letter-spacing: 0.06em;
    font-size: 0.88em;
  }
  .spinner {
    display: inline-block;
    width: 1ch;
    text-align: center;
    will-change: transform, text-shadow;
  }
  .subtle .spinner {
    will-change: auto;
  }
  .label {
    display: inline-flex;
  }
  .letter {
    display: inline-block;
    will-change: opacity;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner, .letter {
      transform: none !important;
      opacity: 1 !important;
      text-shadow: 0 0 4px currentColor !important;
    }
    .subtle .spinner {
      text-shadow: none !important;
    }
  }
</style>
