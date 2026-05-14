<script lang="ts">
  import BlinkingLight from "./BlinkingLight.svelte";
  import ModelSelect from "./ModelSelect.svelte";
  import ThinkingIndicator from "./ThinkingIndicator.svelte";
  import SpeedSlider from "./SpeedSlider.svelte";
  import FontSelect from "./FontSelect.svelte";
  import FullscreenToggle from "./FullscreenToggle.svelte";
  import RestartButton from "./RestartButton.svelte";
  import MuteButton from "./MuteButton.svelte";
  import VolumeSlider from "./VolumeSlider.svelte";
  import { boot } from "../stores/boot.svelte";
  import { work } from "../stores/work.svelte";

  let {
    selectedModel = $bindable<string | null>(null),
    busy = false,
    onrestart,
  }: {
    selectedModel: string | null;
    busy: boolean;
    onrestart: () => void;
  } = $props();

  // After boot, the indicator is always alive — never quiet. Label flips
  // between "thinking" (an actual LLM call is in flight) and the current
  // rotating tool name from the work store ("scanning logs",
  // "watching halberd", etc) — the agent's "anxiety": never doing
  // nothing.
  const indicatorActive = $derived(boot.online && (busy || work.active));
  const indicatorLabel = $derived(busy ? "thinking" : work.tool || "thinking");
</script>

<header class="phase-{boot.phase}">
  <BlinkingLight />
  <span class="title">spaghetti :: <span class="sub">awakening</span></span>
  <span class="status">
    <!-- Subtle in the header — ambient signal, not where the operator
         is looking. The full-animation copy lives inline in the empty
         agent bubble at the edge of the conversation. -->
    <ThinkingIndicator active={indicatorActive} label={indicatorLabel} subtle />
  </span>
  <FontSelect />
  <SpeedSlider />
  <VolumeSlider />
  <MuteButton />
  <FullscreenToggle />
  <RestartButton {onrestart} />
  <ModelSelect bind:value={selectedModel} />
</header>

<style>
  header {
    display: grid;
    /* light  title  status   font   speed   vol   mute  fs   restart   model */
    grid-template-columns: 1.5em auto 1fr 9rem 10rem 7rem auto auto auto 15rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #114422;
  }
  .title {
    letter-spacing: 0.05em;
    color: #226633;
    font-weight: bold;
    transition: color 800ms ease, text-shadow 800ms ease;
    white-space: nowrap;
  }
  .phase-online .title {
    color: #33ff66;
    text-shadow: 0 0 6px rgba(51,255,102,0.4);
  }
  .sub { color: #66ffaa; }
  .status {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }

  @media (max-width: 980px) {
    header {
      grid-template-columns: 1.5em 1fr auto auto;
      grid-template-areas:
        "light title  status model"
        "font  font   speed  speed";
    }
    header > :global(.speed) { grid-area: speed; }
    /* FontSelect is just a <select>; target its tag at the same level. */
    header > :global(select[aria-label="font family"]) { grid-area: font; }
  }
</style>
