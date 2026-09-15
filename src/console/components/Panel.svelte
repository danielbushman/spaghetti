<!--
  Panel — a card with a title row and a spring reveal on mount (plan §7 T6).

  `springReveal` paints at rest when it starts visible, so the panel mounts
  hidden and flips `shown` on mount to run the spring once. The action
  honours `prefers-reduced-motion` and snaps when rAF is unavailable.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { springReveal, SPRINGS } from '../../client/motion/spring';

  let {
    title,
    subtitle,
    actions,
    children,
  }: {
    title: string;
    subtitle?: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  let shown = $state(false);
  onMount(() => {
    shown = true;
  });
</script>

<section
  class="panel card"
  aria-label={title}
  use:springReveal={{ visible: shown, from: 'bottom', distance: 12, config: SPRINGS.noWobble }}
>
  <header class="head">
    <div class="titles">
      <h3 class="title">{title}</h3>
      {#if subtitle}
        <p class="subtitle dim">{subtitle}</p>
      {/if}
    </div>
    {#if actions}
      <div class="actions">{@render actions()}</div>
    {/if}
  </header>
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--gap);
  }
  .title {
    font-size: 0.95em;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .subtitle {
    font-size: 0.85em;
    margin-top: 0.15em;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5em;
    flex: none;
  }
  .body {
    min-width: 0;
  }
</style>
