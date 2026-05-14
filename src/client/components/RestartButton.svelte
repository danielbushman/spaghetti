<!--
  Soft-restart button. Triggers the same reset flow as F2 — bounces
  the game back to the photosensitivity-warning gate without
  reloading the page (so fullscreen state is preserved).

  Visual matches the other muted header controls (FullscreenToggle,
  selects): subdued by default, brightens to terminal-green on hover
  / focus. Title shows the keyboard shortcut for discoverability.
-->
<script lang="ts">
  let { onrestart }: { onrestart: () => void } = $props();
</script>

<button
  type="button"
  onclick={onrestart}
  aria-label="restart"
  title="restart (F2)"
>
  ⟳
</button>

<style>
  button {
    background: transparent;
    color: #557755;
    border: 1px solid #1a3322;
    padding: 0.15rem 0.4rem;
    font-family: inherit;
    font-size: 1.05em;
    line-height: 1;
    cursor: pointer;
    transition:
      color 200ms ease,
      border-color 200ms ease,
      box-shadow 200ms ease;
  }
  button:hover {
    color: #33ff66;
    border-color: #33ff66;
  }
  button:focus-visible {
    outline: 0;
    border-color: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.4);
  }
</style>
