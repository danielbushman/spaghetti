<!--
  Animated "thinking" indicator for when the agent is mid-turn.

  Braille spinner — 10-frame rotation at 80ms per frame, ~125ms cycle. Classic
  CLI vocabulary (npm install, git, cargo); the rotating glyph reads as
  "actively working" without taking visual real estate.

  Amber colour matches the boot "warm" phase so the visual language for
  "system busy" is consistent across phases.

  The setInterval is scoped to `active` via $effect — when active flips
  false, the cleanup clears it. Idle cost = zero.
-->
<script lang="ts">
  let { active = false, label = "thinking" }: { active: boolean; label?: string } = $props();

  const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = $state(0);

  $effect(() => {
    if (!active) {
      frame = 0;
      return;
    }
    const handle = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
    }, 80);
    return () => clearInterval(handle);
  });
</script>

{#if active}
  <span class="thinking" role="status" aria-live="polite" aria-label="agent is {label}">
    <span class="spinner" aria-hidden="true">{FRAMES[frame]}</span>
    <span class="label">{label}</span>
  </span>
{/if}

<style>
  .thinking {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #ffaa33;
    font-weight: bold;
    text-shadow: 0 0 6px rgba(255, 170, 51, 0.55);
    letter-spacing: 0.04em;
  }
  .spinner {
    display: inline-block;
    width: 1ch;
    /* The Braille glyphs are slightly narrower than monospace cells; this
       avoids the label jittering as frames change. */
    text-align: center;
  }
  .label {
    font-size: 0.92em;
  }
</style>
