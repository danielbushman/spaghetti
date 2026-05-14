<!--
  One row in the status panel. Slides in from the right with overshoot when
  it mounts (each item pops independently because telemetry reveals them
  staggered).

  Color states:
    red       — broken, awaiting attention. Clickable; triggers onpick.
    working   — operator picked this; fix in flight. Amber, pulsing.
    green     — resolved. Soft glow, no interaction.

  Click + keyboard activation both fire onpick when the item is red.
-->
<script lang="ts">
  import type { StatusItem } from "../stores/telemetry.svelte";
  import { onMount } from "svelte";
  import { overshoot } from "../motion/easings";
  import { effects } from "../stores/effects.svelte";

  let { item, onpick }: { item: StatusItem; onpick?: (id: string) => void } = $props();

  let el: HTMLDivElement | undefined = $state();

  // True for ~1.2s when this item is the focal point of a flash event —
  // either the staggered initial reveal ("first becoming aware") or a
  // state change later (red→working, working→green). Multiple items
  // can be flashing simultaneously (per-item windows tracked in the
  // effects store's Set). The .spotlight CSS class applies a
  // camera-jump scale animation + amplified glow so the focal item
  // pops *toward* the viewer while the scene dims around it.
  const isFlashing = $derived(effects.flashingItems.has(item.id));

  onMount(() => {
    if (!el) return;
    const t0 = performance.now();
    const dur = 360;
    let raf = 0;
    function frame(t: number) {
      const p = Math.min(1, (t - t0) / dur);
      const e = overshoot(p);
      el!.style.transform = `translateX(${(1 - e) * 18}px)`;
      el!.style.opacity = String(Math.min(1, p * 1.4));
      if (p < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  function activate() {
    if (item.state === "red") onpick?.(item.id);
  }
</script>

<!--
  Always a <button> (native keyboard handling for Enter/Space) but disabled
  when the item isn't actionable. Sidesteps the a11y warning about a
  presentation-role element with a tabindex, and lets the browser do the
  focus management.
-->
<!--
  Two-layer transform structure so the slide-in (set inline by JS on
  the outer button) and the spotlight camera-jump (CSS animation on
  the inner div) don't fight each other for the same transform
  property. Outer translates from offscreen; inner scales toward the
  camera. They compose via the parent-child relationship.
-->
<button
  type="button"
  class="item state-{item.state}"
  bind:this={el}
  style="opacity: 0;"
  disabled={item.state !== "red"}
  onclick={activate}
>
  <div class="content" class:spotlight={isFlashing}>
    <span class="dot">●</span>
    <span class="label">{item.label}</span>
    <span class="hint">{item.hint}</span>
  </div>
</button>

<style>
  .item {
    /* Reset button defaults so the row reads as a row, not a button */
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    width: 100%;
    padding: 0;
    cursor: default;
  }
  .item.state-red { cursor: pointer; }
  .item.state-red:focus-visible {
    outline: 1px solid #ff6666;
    outline-offset: -1px;
  }
  .item:disabled { cursor: default; }

  /*
    Inner content wrapper — owns the grid layout AND the spotlight
    camera-jump transform. Kept separate from the button so the outer
    slide-in transform (set inline by JS on mount) and the spotlight
    scale (CSS animation here) don't compete.
  */
  .content {
    display: grid;
    grid-template-columns: 1em 11em 1fr;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.3rem;
    border-radius: 2px;
    transition: background 250ms ease;
    transform-origin: left center;
  }
  .item.state-red:hover .content { background: rgba(255, 80, 80, 0.08); }
  .dot { transition: color 600ms ease, text-shadow 600ms ease; }
  .state-red .dot {
    color: #ff4444;
    text-shadow: 0 0 6px rgba(255, 80, 80, 0.6);
  }
  .state-working .dot {
    color: #ffaa33;
    text-shadow: 0 0 8px rgba(255, 170, 51, 0.7);
    animation: working-pulse 900ms ease-in-out infinite;
  }
  .state-green .dot {
    color: #33ff66;
    text-shadow: 0 0 6px rgba(51, 255, 102, 0.5);
  }
  @keyframes working-pulse {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }
  .label {
    color: #33ff66;
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state-working .label { color: #ffaa33; }
  .state-green .label   { color: #66ffaa; }
  .hint {
    color: #557755;
    font-size: 0.82em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
    Spotlight — the "first becoming aware" moment. Runs for ~1.2s.

    Camera-jump scale: the row punches toward the viewer with an
    expo-out easing on the way out, holds at the zoomed state for
    most of the window, then settles back. The brightness on the
    dot + label tracks the same curve via keyframe text-shadow
    changes, so the *whole row* lights up rather than just the dot.

    transform-origin: left center on the parent keeps the row
    anchored to its left edge so it doesn't slide right while
    scaling.
  */
  .content.spotlight {
    animation: spotlight-jump 1200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes spotlight-jump {
    /* Start position. Background subtle so the transition reads. */
    0% {
      transform: scale(1);
      background: transparent;
    }
    /* PUNCH — fast snap toward the camera with overshoot.
       step-end on text-shadow lets the glow appear instantly with
       the punch rather than easing in slowly. */
    12% {
      transform: scale(1.20);
      background: rgba(220, 255, 230, 0.10);
    }
    /* Slight relax into the zoomed hold state. */
    22% {
      transform: scale(1.17);
      background: rgba(220, 255, 230, 0.09);
    }
    /* Held forward — the operator gets a long look. */
    75% {
      transform: scale(1.15);
      background: rgba(220, 255, 230, 0.07);
    }
    /* Return to rest. */
    100% {
      transform: scale(1);
      background: transparent;
    }
  }

  /*
    Dot + label glow during the spotlight window. Implemented on the
    spotlight class (rather than as part of the keyframes above) so
    the glow snaps with the punch and returns with the settle, and
    the text-shadow doesn't have to interpolate every frame.
  */
  .content.spotlight .dot {
    text-shadow:
      0 0 16px currentColor,
      0 0 32px currentColor;
  }
  .content.spotlight .label {
    text-shadow: 0 0 10px currentColor;
  }
  .dot, .label { transition: text-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1); }
</style>
