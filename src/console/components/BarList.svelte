<!--
  BarList — label | bar | value | share % (plan §4.4 Spend Explorer, T6).

  Bars are drawn at `share` of the row width, so a 39 % row fills 39 % of
  the track — the bar is the number, not a rescaled version of it. Every row
  carries a direct value label in mono. When `tone` is `series` each row gets
  its series marker glyph in the series hue (matching a TimeSeries drawn
  from the same items); `money` draws every bar in `--money`. Rows with an
  `href` are links; rows without (e.g. `other`, customers) are plain.
-->
<script lang="ts">
  import { seriesStyle } from '../palette';

  interface BarItem {
    key: string;
    label: string;
    value: number;
    /** 0–1 share of the total. */
    share: number;
    hint?: string;
    href?: string;
  }

  let {
    items,
    fmt,
    tone = 'money',
  }: {
    items: BarItem[];
    fmt: (v: number) => string;
    tone?: 'money' | 'series';
  } = $props();

  const pct = (s: number): string => `${(Math.max(0, Math.min(1, s)) * 100).toFixed(1)}%`;
  const widthOf = (s: number): string => `${(Math.max(0, Math.min(1, s)) * 100).toFixed(2)}%`;
</script>

<ol class="bars tone-{tone}" aria-label="breakdown">
  {#each items as item, i (item.key)}
    {@const style = seriesStyle(i)}
    <li>
      <svelte:element
        this={item.href ? 'a' : 'div'}
        class="row"
        class:door={!!item.href}
        href={item.href || undefined}
      >
        <span class="label">
          {#if tone === 'series'}
            <span class="marker mono" style:color={style.color} aria-hidden="true">{style.marker}</span>
          {/if}
          <span class="name mono">{item.label}</span>
        </span>
        <span class="track" aria-hidden="true">
          <span
            class="bar"
            style:width={widthOf(item.share)}
            style:background={tone === 'series' ? style.color : undefined}
          ></span>
        </span>
        <span class="value mono" class:money={tone === 'money'}>{fmt(item.value)}</span>
        <span class="share mono dim">{pct(item.share)}</span>
        {#if item.hint}
          <span class="hint mono dim">{item.hint}</span>
        {/if}
      </svelte:element>
    </li>
  {/each}
  {#if items.length === 0}
    <li class="empty dim">nothing in range</li>
  {/if}
</ol>

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35em;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) 1fr auto auto;
    grid-template-areas:
      'label track value share'
      'label hint hint hint';
    align-items: center;
    column-gap: 0.75em;
    row-gap: 0.1em;
    padding: 0.2em 0.35em;
    border-radius: 6px;
    color: var(--fg);
  }
  .door {
    cursor: pointer;
    text-decoration: none;
  }
  .door:hover {
    background: var(--bg-2);
    text-decoration: none;
  }
  .label {
    grid-area: label;
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .marker {
    flex: none;
    line-height: 1;
  }
  .track {
    grid-area: track;
    display: block;
    height: 0.7em;
    background: var(--bg-3);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--fg-muted);
  }
  .tone-money .bar { background: var(--money); }
  .value {
    grid-area: value;
    text-align: right;
    min-width: 5.5em;
  }
  .share {
    grid-area: share;
    text-align: right;
    min-width: 4em;
    font-size: 0.9em;
  }
  .hint {
    grid-area: hint;
    font-size: 0.8em;
  }
  .empty {
    padding: 0.4em 0.35em;
    font-size: 0.9em;
  }
</style>
