<!--
  Audio mute toggle for the header. Subdued by default like the
  other "advanced settings"; brightens on hover/focus. Persists via
  the audio store's localStorage backing.
-->
<script lang="ts">
  import { audio } from "../audio";

  function toggle(): void {
    audio.toggleMuted();
  }
</script>

<button
  type="button"
  onclick={toggle}
  aria-label={audio.muted ? "unmute audio" : "mute audio"}
  aria-pressed={audio.muted}
  title={audio.muted ? "audio muted" : "audio on"}
  class:muted={audio.muted}
>
  {audio.muted ? "♪̸" : "♪"}
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
  button.muted {
    color: #553333;
    border-color: #331a1a;
  }
  button.muted:hover {
    color: #ff6666;
    border-color: #ff6666;
  }
</style>
