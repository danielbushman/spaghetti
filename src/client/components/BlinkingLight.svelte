<!--
  A single terminal-style status dot that breathes rather than blinks.

  Breath is a triangle wave (0→1→0) passed through a sine ease so the bright
  and dim ends hold slightly. Color and cadence shift with boot phase:
    idle  → dim red, slow
    cold  → red, slow
    warm  → amber, medium
    online → green, faster + glow halo
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { breathe } from "../motion/easings";
  import { boot, type BootPhase } from "../stores/boot.svelte";

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

  let glow = $derived(boot.phase === "online" ? "8px" : boot.phase === "warm" ? "4px" : "0");
</script>

<span class="light" style="opacity: {opacity}; color: {color}; text-shadow: 0 0 {glow} {color};">●</span>

<style>
  .light {
    display: inline-block;
    width: 1em;
    text-align: center;
    transition: color 800ms ease, text-shadow 800ms ease;
  }
</style>
