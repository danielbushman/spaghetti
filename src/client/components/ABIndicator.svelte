<!--
  Big A/B compare indicator. Only renders when abtest.mode === "active".
  Floats above the scene in the upper-third (so it doesn't fight the
  centre-of-attention while the boot sequence is doing its thing), at
  large enough scale to be unmistakable across the room.

  Two colour treatments — amber for A, cyan for B — so the operator
  can tell at a glance which side is playing even without reading the
  letter. The letter itself uses a brief punch-in scale + glow so the
  flip between cycles registers as a visible event, not a static label.
-->
<script lang="ts">
  import { abtest } from "../stores/abtest.svelte";
</script>

{#if abtest.mode === "active"}
  <!--
    Keyed on `current` so flipping A→B unmounts the old letter and
    mounts the new one — that re-triggers the punch-in animation
    rather than just swapping text in place.
  -->
  {#key abtest.current}
    <div
      class="ab side-{abtest.current.toLowerCase()}"
      aria-live="polite"
      aria-label="A/B compare: side {abtest.current}"
    >
      {abtest.current}
    </div>
  {/key}
{/if}

<style>
  .ab {
    position: fixed;
    top: 8vh;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    user-select: none;
    z-index: 300;
    font-family: inherit;
    font-weight: bold;
    font-size: clamp(7rem, 22vw, 22rem);
    line-height: 0.85;
    opacity: 0.55;
    letter-spacing: 0.02em;
    animation: punch 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  /* Amber A: warm, baseline. */
  .side-a {
    color: #ffcc44;
    text-shadow:
      0 0 30px rgba(255, 204, 68, 0.45),
      0 0 60px rgba(255, 204, 68, 0.18);
  }
  /* Cyan B: cool, alternative. The colour contrast alone tells the
     operator which side they're on without needing to read. */
  .side-b {
    color: #44ccff;
    text-shadow:
      0 0 30px rgba(68, 204, 255, 0.45),
      0 0 60px rgba(68, 204, 255, 0.18);
  }

  /* Punch in: small + bright → settled. */
  @keyframes punch {
    0% {
      transform: translateX(-50%) scale(0.6);
      opacity: 0;
      filter: blur(8px);
    }
    35% {
      transform: translateX(-50%) scale(1.08);
      opacity: 0.85;
      filter: blur(0);
    }
    100% {
      transform: translateX(-50%) scale(1);
      opacity: 0.55;
      filter: blur(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ab { animation: none; opacity: 0.55; }
  }
</style>
