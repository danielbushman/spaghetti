<script lang="ts">
  import { chat } from "../stores/chat.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import { tick } from "svelte";

  let logEl: HTMLDivElement | undefined = $state();

  // Auto-scroll to bottom whenever message count or the visible text of the
  // last message changes (typewriter ticks).
  $effect(() => {
    void chat.messages.length;
    const last = chat.messages[chat.messages.length - 1];
    void last?.visible.length;
    void tick().then(() => {
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    });
  });
</script>

<div class="log" bind:this={logEl} role="log" aria-live="polite">
  {#each chat.messages as m (m.id)}
    <ChatMessage message={m} />
  {/each}
</div>

<style>
  .log {
    border: 1px solid #114422;
    padding: 0.6rem 0.8rem;
    overflow-y: auto;
    background: #000;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 0;
  }
  .log::-webkit-scrollbar { width: 6px; }
  .log::-webkit-scrollbar-thumb { background: #114422; }
  .log::-webkit-scrollbar-track { background: transparent; }
</style>
