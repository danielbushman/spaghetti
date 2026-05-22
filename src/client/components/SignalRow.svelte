<script lang="ts">
  import type { Signal } from "../stores/telemetry.svelte";
  import Sparkline from "./Sparkline.svelte";

  let { signal }: { signal: Signal } = $props();

  /**
   * Decimal places. Runway is always 1 decimal (read as months); other
   * gauges pick precision based on their range — small-range signals get
   * a decimal, big-range ones round to integer.
   */
  const precision = $derived(
    signal.id === "runway" ? 1 : signal.max <= 50 ? 1 : 0,
  );
</script>

<!--
  Three-column grid: label / value / sparkline.

  Column widths are in `ch` (character widths) rather than `em` so they
  size to the monospace font's actual character cell width — eliminates
  the bug where "errors/s" (8 chars) overflowed a 5em label cell once
  the browser fell back to a slightly wider font. `overflow: ellipsis`
  is the belt-and-braces handler.

  `min-width: 0` on the sparkline cell lets it shrink under content
  rather than expand the grid (grid items default to min-content size,
  which can blow out the layout).

  The .runway row gets a distinct lime-yellow-green colour — same hue
  as the money tokens in chat output — so the eye reads runway as
  belonging to the "money" visual language rather than the regular
  green system gauges.
-->
<div class="row" class:runway={signal.id === "runway"}>
  <span class="label">{signal.label}</span>
  <span class="value"
    >{signal.current.toFixed(precision)}<small>{signal.unit}</small></span
  >
  <span class="spark">
    <Sparkline
      values={signal.history}
      minHint={signal.min}
      maxHint={signal.max}
      width={84}
      height={16}
    />
  </span>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 9ch 6ch 1fr;
    align-items: center;
    gap: 0.55rem;
    padding: 0.18rem 0;
    font-size: 0.88em;
  }
  .label {
    color: #88bb88;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value {
    color: #33ff66;
    font-variant-numeric: tabular-nums;
    text-align: right;
    text-shadow: 0 0 4px rgba(51, 255, 102, 0.3);
    white-space: nowrap;
  }
  .value small {
    opacity: 0.6;
    margin-left: 0.15em;
    font-size: 0.85em;
  }
  .spark {
    color: #33ff66;
    min-width: 0;
    /* Center the SVG horizontally within the available 1fr column so
       small layout reflows don't push it left-justified against the
       value cell. */
    display: flex;
    justify-content: flex-end;
  }

  /* Runway = money signal. Same lime-yellow-green as the chat
     money-token tone, so all "this is money" cues share a hue. */
  .row.runway .label { color: #aacc55; }
  .row.runway .value {
    color: #ddff44;
    text-shadow: 0 0 4px rgba(204, 255, 100, 0.4);
  }
  .row.runway .spark { color: #ddff44; }
</style>
