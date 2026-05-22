<script lang="ts">
  import { ollama } from "../stores/ollama.svelte";

  let { value = $bindable<string | null>(null) }: { value: string | null } = $props();
</script>

<select bind:value disabled={ollama.models.length === 0}>
  {#if ollama.models.length === 0}
    <option value={null}>{ollama.error ? "ghetti unreachable" : "loading models…"}</option>
  {:else}
    {#each ollama.models as m (m.name)}
      <option value={m.name}>{m.name}</option>
    {/each}
  {/if}
</select>

<style>
  /*
    Subdued by default — this is an advanced setting, not a primary
    action. Muted text + faint border. Hover/focus brightens to the
    saturated terminal-green for clear "you can interact with me"
    affordance.
  */
  select {
    background: #060c08;
    color: #557755;
    border: 1px solid #1a3322;
    padding: 0.2rem 0.4rem;
    font-family: inherit;
    font-size: inherit;
    transition: color 200ms ease, border-color 200ms ease, background 200ms ease;
  }
  select:hover {
    color: #33ff66;
    border-color: #33ff66;
    background: #001a0d;
  }
  select:focus {
    outline: 0;
    color: #33ff66;
    border-color: #33ff66;
    background: #001a0d;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.3);
  }
  select:disabled { color: #335533; cursor: default; }
</style>
