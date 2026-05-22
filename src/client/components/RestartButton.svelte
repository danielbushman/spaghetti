<!--
  Soft-restart split-button.

  Primary half (⟳) — same as before: bounces back to the
  photosensitivity gate without reloading the page; F2 shortcut.

  Caret half (▾) — opens a popover with replay-loop options:
    • "Loop to here"   captures the current elapsed time and starts
                      auto-restarting every time the live run crosses
                      that mark again. Useful for iterating on a
                      specific beat.
    • "Stop looping"  clears the active loop.

  When a loop is active, the primary icon gets a small marker dot
  so it's visible at a glance that auto-replay is on.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { loop } from "../stores/loop.svelte";
  import { abtest } from "../stores/abtest.svelte";

  let { onrestart }: { onrestart: () => void } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  // Live elapsed-since-run-start for the popover status footer. Only
  // ticks while the popover is open so we don't churn the reactive
  // graph for nothing. $effect's return is the cleanup, so closing
  // the popover (or unmounting) clears the interval automatically.
  let nowMs = $state(Date.now());
  $effect(() => {
    if (!open) return;
    nowMs = Date.now();
    const id = setInterval(() => { nowMs = Date.now(); }, 100);
    return () => clearInterval(id);
  });

  // Outside-click + Esc close the popover. Pointerdown rather than
  // click so we close even if the click target's listeners cancel.
  onMount(() => {
    function onPointer(e: PointerEvent): void {
      if (!open) return;
      if (root && !root.contains(e.target as Node)) open = false;
    }
    function onKey(e: KeyboardEvent): void {
      if (open && e.key === "Escape") open = false;
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  });

  function toggleMenu(): void { open = !open; }

  // Live derived: elapsed and whether we have *any* run started yet.
  // runStartMs is plain (not $state) on the loop store, but it's
  // assigned only on mount/restart — read it via the live nowMs tick
  // so the popover updates while open.
  const elapsedMs = $derived(open ? Math.max(0, nowMs - (loop.runStartMs ?? nowMs)) : 0);
  const canLoop = $derived(loop.runStartMs !== null && elapsedMs > 500);

  function fmtSec(ms: number): string {
    const s = ms / 1000;
    return s < 10 ? s.toFixed(2) + "s" : s.toFixed(1) + "s";
  }

  function onLoopToHere(): void {
    if (!canLoop) return;
    loop.setLoopToHere();
    open = false;
  }

  function onClearLoop(): void {
    loop.clearLoop();
    // A/B compare without a loop is meaningless — clear it too so
    // the big A/B overlay vanishes when the loop is stopped.
    abtest.disable();
    open = false;
  }

  function onToggleAB(): void {
    if (!loop.active) return;
    if (abtest.mode === "active") abtest.disable();
    else abtest.enable();
    open = false;
  }
</script>

<div class="wrap" bind:this={root}>
  <button
    type="button"
    class="primary"
    class:looping={loop.active}
    onclick={onrestart}
    aria-label="restart"
    title={loop.active
      ? `restart (F2) — loop active @ ${fmtSec(loop.targetMs ?? 0)}`
      : "restart (F2)"}
  >
    ⟳{#if loop.active}<span class="dot" aria-hidden="true"></span>{/if}
  </button>
  <button
    type="button"
    class="caret"
    class:open
    onclick={toggleMenu}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="replay-loop menu"
    title="replay-loop options"
  >▾</button>

  {#if open}
    <div class="menu" role="menu">
      <button
        type="button"
        role="menuitem"
        class="item"
        disabled={!canLoop}
        onclick={onLoopToHere}
        title="Starts over and replays to this same point repeatedly"
      >
        <span class="glyph">🔁</span>
        <span class="label">Loop to here</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="item"
        disabled={!loop.active}
        onclick={onClearLoop}
        title="Clear the active loop"
      >
        <span class="glyph">✕</span>
        <span class="label">Stop looping</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="item"
        class:on={abtest.mode === "active"}
        disabled={!loop.active}
        onclick={onToggleAB}
        title="Alternate A/B variants on each loop cycle"
      >
        <span class="glyph">⚖</span>
        <span class="label">
          Compare A/B
          {#if abtest.mode === "active"}<span class="hint">(on · {abtest.current})</span>{/if}
        </span>
      </button>
      <div class="footer">
        {#if loop.active}
          <span class="muted">Active loop:</span>
          <span class="value">{fmtSec(loop.targetMs ?? 0)}</span>
        {:else}
          <span class="muted">No loop set</span>
        {/if}
        {#if loop.runStartMs !== null}
          <span class="sep">·</span>
          <span class="muted">now:</span>
          <span class="value dim">{fmtSec(elapsedMs)}</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
    align-items: stretch;
  }

  /* Split-button: shared border, primary on the left, caret on the
     right, single visual unit. */
  button {
    background: transparent;
    color: #557755;
    border: 1px solid #1a3322;
    font-family: inherit;
    line-height: 1;
    cursor: pointer;
    transition:
      color 200ms ease,
      border-color 200ms ease,
      box-shadow 200ms ease,
      background 200ms ease;
  }
  .primary {
    position: relative;
    padding: 0.15rem 0.4rem;
    font-size: 1.05em;
    border-right: 0;
    border-radius: 0;
  }
  .caret {
    padding: 0.15rem 0.3rem;
    font-size: 0.75em;
    border-left: 1px solid #1a3322;
    border-radius: 0;
  }
  .primary:hover,
  .caret:hover,
  .caret.open {
    color: #33ff66;
    border-color: #33ff66;
  }
  /* Hover on either half should brighten the seam between them too. */
  .wrap:hover .primary { border-color: #33ff66; }
  .wrap:hover .caret  { border-color: #33ff66; }

  .primary:focus-visible,
  .caret:focus-visible {
    outline: 0;
    border-color: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.4);
  }

  /* Active-loop indicator: a small orange-ish dot at the top-right
     of the primary glyph. Stays out of the layout flow so the icon
     doesn't shift. */
  .primary.looping { color: #ffcc44; }
  .dot {
    position: absolute;
    top: 0.18rem;
    right: 0.22rem;
    width: 0.32em;
    height: 0.32em;
    border-radius: 50%;
    background: #ffcc44;
    box-shadow: 0 0 4px rgba(255, 204, 68, 0.8);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1;   transform: scale(1); }
    50%      { opacity: 0.45; transform: scale(0.85); }
  }

  /* Popover */
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 400;
    min-width: 14rem;
    background: #050a07;
    border: 1px solid #114422;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    padding: 0.25rem;
    display: grid;
    gap: 0.1rem;
  }
  .item {
    display: grid;
    grid-template-columns: 1.4em 1fr;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    text-align: left;
    border: 1px solid transparent;
    color: #66aa77;
    font-size: 0.9em;
  }
  .item:hover:not(:disabled),
  .item:focus-visible:not(:disabled) {
    color: #33ff66;
    border-color: #114422;
    background: rgba(17, 68, 34, 0.25);
    outline: 0;
  }
  .item:disabled {
    color: #2a4433;
    cursor: not-allowed;
  }
  .item.on {
    color: #66ffaa;
  }
  .item.on .glyph { color: #ffcc44; }
  .glyph {
    font-size: 0.95em;
    text-align: center;
  }
  .label {
    letter-spacing: 0.02em;
  }
  .hint {
    margin-left: 0.4rem;
    font-size: 0.82em;
    color: #557755;
    font-variant-numeric: tabular-nums;
  }

  .footer {
    margin-top: 0.15rem;
    padding: 0.3rem 0.5rem 0.2rem;
    border-top: 1px dashed #114422;
    font-size: 0.78em;
    color: #557755;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .footer .muted { color: #3a553a; }
  .footer .value { color: #66ffaa; font-variant-numeric: tabular-nums; }
  .footer .value.dim { color: #557755; }
  .footer .sep { color: #2a4433; }
</style>
