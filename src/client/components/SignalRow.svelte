<script lang="ts">
  import type { Signal } from "../stores/telemetry.svelte";
  import Sparkline from "./Sparkline.svelte";

  let { signal }: { signal: Signal } = $props();
</script>

<div class="row">
  <span class="label">{signal.label}</span>
  <span class="value">{signal.current.toFixed(signal.max <= 50 ? 1 : 0)}<small>{signal.unit}</small></span>
  <span class="spark"><Sparkline values={signal.history} minHint={signal.min} maxHint={signal.max} width={88} height={16} /></span>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 5em 4.5em 1fr;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0;
    font-size: 0.88em;
  }
  .label { color: #557755; }
  .value {
    color: #33ff66;
    font-variant-numeric: tabular-nums;
    text-align: right;
    text-shadow: 0 0 4px rgba(51, 255, 102, 0.3);
  }
  .value small { opacity: 0.6; margin-left: 0.1em; }
  .spark { color: #33ff66; }
</style>
