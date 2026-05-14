<!--
  Animated "thinking" indicator. Combines a Braille spinner with a multi-
  oscillator pulse of opacity, scale, and glow on three independently-
  detuned periods. Subtle but never quite the same shape twice — the three
  oscillators drift in and out of phase across the visible lifetime.

  Three oscillators (each on the motion library's easings):

    letter wave   breathe   1600ms   per-letter phase offset 0.10
                                     opacity 0.45 → 1.00 → 0.45
                                     creates a wave traveling through
                                     "thinking" rather than uniform pulsing.

    spinner scale breathe   1400ms   1.00 → 1.06 → 1.00, very subtle.

    glow blur    overshoot 1100ms   4px → 12.7px. overshoot fed a triangle
                                     wave has a double-pulse rhythm —
                                     two peaks per cycle at the quarter
                                     points (overshoot(0.5) ≈ 1.087) —
                                     gives the glow a heartbeat quality
                                     distinct from the smooth letter wave.

  Frame cycle (Braille glyph) is still 80ms via the same rAF loop.

  Periods are deliberately non-harmonic (1600/1400/1100 share no common
  factor). The three never align cleanly, so the indicator's overall
  visual signature drifts continuously.
-->
<script lang="ts">
  import { breathe, overshoot } from "../motion/easings";

  let { active = false, label = "thinking" }: { active: boolean; label?: string } = $props();

  const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  let frame = $state(0);
  let elapsed = $state(0);

  // rAF-driven elapsed clock. One loop drives all three oscillators
  // plus the spinner-frame advance — every reactive update happens
  // exactly once per frame.
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

  /** Triangle wave with period 1: 0 → 1 → 0. */
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
  <span class="thinking" role="status" aria-live="polite" aria-label="agent is {label}">
    <span
      class="spinner"
      style="transform: scale({spinnerScale()}); text-shadow: 0 0 {glowPx()}px currentColor;"
      aria-hidden="true"
    >{FRAMES[frame]}</span>
    <span class="label"
      >{#each labelChars as ch, i (i)}<span class="letter" style="opacity: {letterOpacity(i)}">{ch}</span>{/each}</span
    >
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
  .spinner {
    display: inline-block;
    width: 1ch;
    text-align: center;
    will-change: transform, text-shadow;
  }
  .label {
    display: inline-flex;
  }
  .letter {
    display: inline-block;
    will-change: opacity;
  }

  /*
    Reduced-motion users get a static, fully-legible indicator. Inline
    styles set by the rAF loop are overridden via !important here.
  */
  @media (prefers-reduced-motion: reduce) {
    .spinner, .letter {
      transform: none !important;
      opacity: 1 !important;
      text-shadow: 0 0 4px currentColor !important;
    }
  }
</style>
