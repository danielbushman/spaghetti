<!--
  A single terminal-style status dot that breathes rather than blinks.

  Breath is a triangle wave (0→1→0) passed through a sine ease so the bright
  and dim ends hold slightly. Color and cadence shift with boot phase:
    idle  → dim red, slow
    cold  → red, slow
    warm  → amber, medium
    online → green, faster + glow halo

  When effects.flashing is true (status state-change punctuation), the
  light overrides its breath state to full brightness with an amplified
  halo. Sits at z-index 250 — above the .status-flash overlay (z 200)
  so it visibly pulses while the rest of the scene dims.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { breathe } from "../motion/easings";
  import { boot, type BootPhase } from "../stores/boot.svelte";
  import { effects } from "../stores/effects.svelte";

  let opacity = $state(0.6);
  let raf = 0;
  let start = 0;

  const PERIOD_MS: Record<BootPhase, number> = {
    idle:   1800,
    cold:   1800,
    warm:   1100,
    online:  800,
  };

  function frame(t: number) {
    if (!start) start = t;
    const period = PERIOD_MS[boot.phase];
    const phase = ((t - start) % period) / period;     // 0..1
    const triangle = 1 - Math.abs(phase * 2 - 1);      // 0→1→0
    const eased = breathe(triangle);
    opacity = 0.25 + 0.75 * eased;
    raf = requestAnimationFrame(frame);
  }

  onMount(() => {
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  let color = $derived(
    boot.phase === "cold"   ? "#ff3333" :
    boot.phase === "warm"   ? "#ffaa33" :
    boot.phase === "online" ? "#33ff66" :
                              "#661111"
  );

  /** Resting glow per boot phase. */
  let restingGlow = $derived(
    boot.phase === "online" ? "8px" : boot.phase === "warm" ? "4px" : "0",
  );

  /*
    During a flash event the light forces to full brightness with a much
    wider halo. Both override values are computed reactively from
    effects.flashing, so they snap back to the breath/resting state
    automatically when the flash window closes.
  */
  let displayOpacity = $derived(effects.flashing ? 1 : opacity);
  let displayShadow = $derived(
    effects.flashing
      ? `0 0 14px ${color}, 0 0 32px ${color}`
      : `0 0 ${restingGlow} ${color}`,
  );
</script>

<span
  class="light"
  class:flashing={effects.flashing}
  style="opacity: {displayOpacity}; color: {color}; text-shadow: {displayShadow};"
  >●</span
>

<style>
  .light {
    display: inline-block;
    width: 1em;
    text-align: center;
    /* z-index 250 sits above the .status-flash overlay (z 200) so the
       light pulses through while the rest of the screen dims. Needs
       position:relative for z-index to take effect on an inline-block. */
    position: relative;
    z-index: 250;
    /* Fast text-shadow transition so the glow snaps with the flash
       and breathes back without lag. Colour stays smooth (800ms) for
       boot-phase changes. */
    transition: color 800ms ease, text-shadow 90ms ease;
  }
  .light.flashing {
    transition: color 800ms ease, text-shadow 60ms ease-out;
  }
</style>
