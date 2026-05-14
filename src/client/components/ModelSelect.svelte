<script lang="ts">
  import { ollama } from "../stores/ollama.svelte";

  let { value = $bindable<string | null>(null) }: { value: string | null } = $props();
</script>

<select bind:value disabled={ollama.models.length === 0}>
  {#if ollama.models.length === 0}
    <option value={null}>{ollama.error ? "ollama unreachable" : "loading models…"}</option>
  {:else}
    {#each ollama.models as m (m.name)}
      <option value={m.name}>{m.name}</option>
    {/each}
  {/if}
</select>

<style>
  select {
    background: #001a0d;
    color: #33ff66;
    border: 1px solid #114422;
    padding: 0.2rem 0.4rem;
    font-family: inherit;
    font-size: inherit;
  }
  select:disabled { color: #557755; }
  select:focus { outline: 0; border-color: #33ff66; box-shadow: 0 0 6px rgba(51,255,102,0.3); }
</style>
