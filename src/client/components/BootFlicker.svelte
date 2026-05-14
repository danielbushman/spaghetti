<!--
  Industrial fluorescent-tube warmup overlay.

  Fluorescent tubes don't switch on cleanly — the gas ionizes in fits, so
  you get one to three seconds of stuttering bursts before the tube
  catches and goes steady. We simulate that on a fixed black scrim above
  the scene. Each "burst" is a sudden drop in scrim opacity that reveals
  the content underneath, then a snap back to dark before the next try.

  Step-end timing is deliberate: real fluorescent flicker is sharp on/off,
  not a crossfade. Linear interpolation between keyframes would smear
  every burst into a tiny dimmer fade and lose the industrial character.

  Pattern (4 seconds total):
    0.0 - 0.7s   dim, with brief crack at 0.4s          (gas not catching)
    0.7 - 1.5s   slightly longer cracks, still failing
    1.5 - 2.7s   tube nearly catches, longer bright holds
    2.7 - 3.8s   ramp toward stable, fewer & shorter dips
    3.8 - 4.0s   settled, one final twitch, then clear

  The component is removed from the DOM the moment boot.phase becomes
  "online", so there's no lingering paint cost after warmup.
-->
<script lang="ts">
  import { boot } from "../stores/boot.svelte";
</script>

{#if boot.phase !== "online"}
  <div class="flicker"></div>
{/if}

<style>
  .flicker {
    position: fixed;
    inset: 0;
    background: #000;
    opacity: 0.92;
    pointer-events: none;
    z-index: 50;
    animation: tube-warmup 4000ms step-end forwards;
  }

  @keyframes tube-warmup {
    /* gas not catching — single crack mid-window */
    0%   { opacity: 0.92; }
    7%   { opacity: 0.92; }
    9%   { opacity: 0.10; }    /* first crack — very brief */
    11%  { opacity: 0.92; }

    /* second failed strike — slightly wider */
    18%  { opacity: 0.92; }
    20%  { opacity: 0.30; }
    22%  { opacity: 0.92; }

    /* third — longer, doesn't catch */
    30%  { opacity: 0.08; }
    33%  { opacity: 0.45; }
    36%  { opacity: 0.92; }

    /* nearly catching — bright stretches with quick drops */
    44%  { opacity: 0.92; }
    47%  { opacity: 0.05; }
    50%  { opacity: 0.20; }
    52%  { opacity: 0.05; }
    56%  { opacity: 0.40; }
    60%  { opacity: 0.08; }
    63%  { opacity: 0.05; }

    /* ramping to stable */
    70%  { opacity: 0.25; }
    76%  { opacity: 0.08; }
    82%  { opacity: 0.04; }
    87%  { opacity: 0.10; }

    /* settled */
    93%  { opacity: 0.00; }
    96%  { opacity: 0.06; }    /* final twitch */
    100% { opacity: 0.00; }
  }

  @media (prefers-reduced-motion: reduce) {
    .flicker {
      animation: none;
      opacity: 0;
    }
  }
</style>
