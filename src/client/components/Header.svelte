<script lang="ts">
  import BlinkingLight from "./BlinkingLight.svelte";
  import ModelSelect from "./ModelSelect.svelte";
  import { boot } from "../stores/boot.svelte";

  let {
    selectedModel = $bindable<string | null>(null),
    busy = false,
  }: {
    selectedModel: string | null;
    busy: boolean;
  } = $props();
</script>

<header class="phase-{boot.phase}">
  <BlinkingLight />
  <span class="title">spaghetti :: <span class="sub">awakening</span></span>
  <span class="status">{busy ? "thinking…" : ""}</span>
  <ModelSelect bind:value={selectedModel} />
</header>

<style>
  header {
    display: grid;
    grid-template-columns: 1.5em 1fr 8rem 18rem;
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
  }
  .phase-online .title {
    color: #33ff66;
    text-shadow: 0 0 6px rgba(51,255,102,0.4);
  }
  .sub { color: #66ffaa; }
  .status {
    color: #557755;
    font-style: italic;
    text-align: right;
    min-width: 6em;
  }
</style>
