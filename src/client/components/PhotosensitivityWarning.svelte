<!--
  Gate screen shown before the boot sequence. Press Esc to opt out (→
  Goodbye), any other key (or click) to continue (→ game starts).

  Window-level keydown listener so the user doesn't need to focus
  anything specific. Click handler on the container as a mouse-only
  alternative for "continue".

  Visually deliberately *outside* the game's terminal aesthetic — this
  is a safety screen, not a game element. Muted greys with one amber
  cue, restrained typography, no animation. Should read as clinical.
-->
<script lang="ts">
  import { onMount } from "svelte";

  let {
    onContinue,
    onOptOut,
  }: {
    onContinue: () => void;
    onOptOut: () => void;
  } = $props();

  function handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onOptOut();
    } else {
      onContinue();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });
</script>

<div
  class="warning"
  onclick={onContinue}
  onkeydown={handleKey}
  role="dialog"
  aria-modal="true"
  aria-labelledby="ps-warn-title"
  tabindex="-1"
>
  <div class="content">
    <div class="icon" aria-hidden="true">⚠</div>
    <h1 id="ps-warn-title">photosensitivity warning</h1>
    <p class="body">
      this game contains rapid flickering, strobing flashes, and high-
      contrast colour changes that may cause discomfort or trigger
      seizures in photosensitive individuals.
    </p>
    <p class="prompt">
      <kbd>esc</kbd> to opt out — <kbd>any other key</kbd> to continue
    </p>
  </div>
</div>

<style>
  .warning {
    position: fixed;
    inset: 0;
    background: #000;
    color: #aaaaaa;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 2rem;
    cursor: pointer;
  }
  .content {
    max-width: 38rem;
    text-align: center;
  }
  .icon {
    font-size: 4rem;
    color: #ffcc44;
    margin-bottom: 1rem;
    text-shadow: 0 0 12px rgba(255, 204, 68, 0.4);
    line-height: 1;
  }
  h1 {
    color: #ffcc44;
    font-size: 1.5rem;
    margin: 0 0 1.5rem 0;
    text-transform: lowercase;
    letter-spacing: 0.08em;
    text-shadow: 0 0 8px rgba(255, 204, 68, 0.3);
    font-weight: bold;
  }
  .body {
    line-height: 1.7;
    margin: 0 0 2.5rem 0;
    color: #bbbbbb;
    font-size: 0.95em;
  }
  .prompt {
    color: #888888;
    margin: 0;
    font-size: 0.9em;
  }
  kbd {
    background: #1a1a1a;
    color: #dddddd;
    padding: 0.15em 0.45em;
    border: 1px solid #333333;
    border-radius: 2px;
    font-family: inherit;
    font-size: 0.95em;
    box-shadow: 0 1px 0 #000;
  }
</style>
