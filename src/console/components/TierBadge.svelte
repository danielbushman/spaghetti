<!--
  TierBadge — swatch square + letter + name (plan §5.1, T6).

  The swatch carries the tier's series hue (an alias of a category colour);
  the letter S / M / F and the tier name are always rendered in `--fg`, so
  the tier is legible with the colour gone. Optional `share` (0–1) appends a
  percentage in mono for tier-mix cells.
-->
<script lang="ts">
  import type { Tier } from '../../sim/types';
  import { TIER_LETTER } from '../palette';

  let { tier, share }: { tier: Tier; share?: number } = $props();

  const pct = $derived(share === undefined ? null : `${Math.round(share * 100)}%`);
</script>

<span class="tier" data-tier={tier} aria-label="tier {tier}{pct ? ` ${pct}` : ''}">
  <span class="swatch tier-{tier}" aria-hidden="true"></span>
  <span class="letter mono">{TIER_LETTER[tier]}</span>
  <span class="name">{tier}</span>
  {#if pct !== null}
    <span class="share mono dim">{pct}</span>
  {/if}
</span>

<style>
  .tier {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    color: var(--fg);
    white-space: nowrap;
  }
  .swatch {
    width: 0.7em;
    height: 0.7em;
    border-radius: 2px;
    flex: none;
  }
  .tier-small { background: var(--tier-small); }
  .tier-medium { background: var(--tier-medium); }
  .tier-frontier { background: var(--tier-frontier); }
  .letter {
    font-weight: 700;
  }
  .name {
    font-family: var(--font-ui);
  }
  .share {
    font-size: 0.9em;
  }
</style>
