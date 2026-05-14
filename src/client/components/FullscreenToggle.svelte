<!--
  Browser fullscreen toggle button for the header. Uses the Fullscreen
  API (document.fullscreenElement / requestFullscreen / exitFullscreen).
  Tracks state via the fullscreenchange event so the button label stays
  accurate when the user enters/exits fullscreen via F11 or Esc.

  Note: browsers require fullscreen requests to originate from a user
  gesture — clicking the button satisfies that. The state never
  persists across reloads (browsers always start in windowed mode).
-->
<script lang="ts">
  import { onMount } from "svelte";

  let isFullscreen = $state(false);

  function update(): void {
    if (typeof document === "undefined") return;
    isFullscreen = document.fullscreenElement !== null;
  }

  async function toggle(): Promise<void> {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("[fullscreen] toggle failed:", e);
    }
  }

  onMount(() => {
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  });
</script>

<button
  type="button"
  onclick={toggle}
  aria-label={isFullscreen ? "exit fullscreen" : "enter fullscreen"}
  title={isFullscreen ? "exit fullscreen" : "fullscreen"}
  class:active={isFullscreen}
>
  {isFullscreen ? "⛞" : "⛶"}
</button>

<style>
  button {
    background: transparent;
    color: #557755;
    border: 1px solid #114422;
    padding: 0.15rem 0.4rem;
    font-family: inherit;
    font-size: 1.05em;
    line-height: 1;
    cursor: pointer;
    transition: color 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
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
  button.active {
    color: #33ff66;
    border-color: #226633;
  }
</style>
