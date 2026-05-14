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

  // True for ~350ms when this item is the focal point of a flash event
  // (state change red→working or working→green triggered by App.svelte
  // passing this id to effects.flash). The .spotlight CSS class amps
  // the glow significantly so the item visibly pops *harder* than the
  // muted-overlay shading on everything else.
  const isFlashing = $derived(
    effects.flashing && effects.flashingItemId === item.id,
  );

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
<button
  type="button"
  class="item state-{item.state}"
  class:spotlight={isFlashing}
  bind:this={el}
  style="opacity: 0;"
  disabled={item.state !== "red"}
  onclick={activate}
>
  <span class="dot">●</span>
  <span class="label">{item.label}</span>
  <span class="hint">{item.hint}</span>
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

    display: grid;
    grid-template-columns: 1em 11em 1fr;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.3rem;
    border-radius: 2px;
    transition: background 200ms ease;
    cursor: default;
  }
  .item.state-red { cursor: pointer; }
  .item.state-red:hover { background: rgba(255, 80, 80, 0.08); }
  .item.state-red:focus-visible {
    outline: 1px solid #ff6666;
    outline-offset: -1px;
  }
  .item:disabled { cursor: default; }
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
    Spotlight — applied for the ~350ms flash window when this item is
    the focal point of a state change. Amplifies the dot's halo,
    boosts the label brightness via its own text-shadow, and adds a
    subtle background highlight. Pops *more* than the surrounding
    dim, which is the whole point — the eye should be drawn to the
    item that just changed, not to the scrim.

    Asymmetric transitions: snaps bright fast on the flash edge,
    breathes back slower as the flash window closes.
  */
  .label { transition: text-shadow 250ms ease-in-out; }
  .item.spotlight {
    background: rgba(220, 255, 230, 0.06);
    transition: background 70ms ease-out;
  }
  .item.spotlight .dot {
    text-shadow:
      0 0 14px currentColor,
      0 0 28px currentColor;
    transition: text-shadow 70ms ease-out;
  }
  .item.spotlight .label {
    text-shadow: 0 0 8px currentColor;
    transition: text-shadow 70ms ease-out;
  }
</style>
