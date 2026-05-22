<!--
  SVG sparkline drawn with d3-shape's line generator + curveBasis.

  curveBasis smooths the corners so the live signal reads as a continuous
  trace rather than a 32-point polyline. It interpolates *through* control
  points (not strictly through the data), which is exactly what we want for
  a "feel" graph — readability over precision.

  Stroke color uses currentColor so a parent can re-tint per state (e.g.
  red while incident is live, green when resolved) without touching the
  svelte component.
-->
<script lang="ts">
  import { line, curveBasis } from "d3-shape";

  let {
    values,
    width = 64,
    height = 14,
    minHint,
    maxHint,
  }: {
    values: number[];
    width?: number;
    height?: number;
    minHint?: number;
    maxHint?: number;
  } = $props();

  const lo = $derived(minHint ?? Math.min(...values, 0));
  const hi = $derived(maxHint ?? Math.max(...values, 1));
  const span = $derived(Math.max(1e-6, hi - lo));

  const path = $derived.by(() => {
    if (values.length < 2) return "";
    const gen = line<number>()
      .x((_, i) => (i / (values.length - 1)) * width)
      .y((v) => height - ((v - lo) / span) * height)
      .curve(curveBasis);
    return gen(values) ?? "";
  });
</script>

<svg viewBox="0 0 {width} {height}" {width} {height} aria-hidden="true">
  <path d={path} fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
  svg { display: block; }
</style>
