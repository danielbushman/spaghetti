<!--
  TimeSeries — lines or stacked areas over sim time (plan §4.4, §7 T6).

  SVG via d3-shape. `curveMonotoneX` is the only curve used: it never
  overshoots the data, so a curve between two samples never shows a value
  that was not recorded (real terms never lie).

  Colour rules (§5.1): series `i` takes `seriesStyle(i)` — hue, legend
  marker glyph, and a dash pattern from index 3 on. A lone `money` series is
  drawn solid in `--money`. Category hues are strokes, fills and swatches
  only; every label is `--fg` / `--fg-muted`. The projection is dashed
  `--fg-muted`. Hover shows a crosshair and per-series values in mono.

  Never throws on empty or single-point input: no buckets draws the frame
  and "no data"; one bucket draws a dot per series.
-->
<script lang="ts">
  import { area, line, stack, curveMonotoneX } from 'd3-shape';
  import { COLORS, MONEY, seriesStyle, type SeriesStyle } from '../palette';

  interface Series {
    key: string;
    label: string;
    values: number[];
  }
  interface Projection {
    bucketT: number[];
    values: number[];
  }

  let {
    bucketT,
    series,
    stacked = false,
    height = 180,
    money = false,
    formatY,
    formatX,
    projection,
    zeroLine = false,
    onSeriesClick,
  }: {
    bucketT: number[];
    series: Series[];
    stacked?: boolean;
    height?: number;
    money?: boolean;
    formatY: (v: number) => string;
    formatX: (t: number) => string;
    projection?: Projection;
    zeroLine?: boolean;
    onSeriesClick?: (s: Series) => void;
  } = $props();

  // --- layout ---------------------------------------------------------------
  let clientWidth = $state(0);
  const width = $derived(clientWidth > 0 ? clientWidth : 480);
  const LABEL_GUTTER = 96; // room for direct labels at the line ends
  const M = { top: 10, right: 8 + LABEL_GUTTER, bottom: 24, left: 60 };
  const innerW = $derived(Math.max(1, width - M.left - M.right));
  const innerH = $derived(Math.max(1, height - M.top - M.bottom));

  const n = $derived(bucketT.length);
  const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

  /** Series `i` style; a lone money series is solid `--money`. */
  const styleOf = (i: number): SeriesStyle =>
    money && series.length === 1 ? { color: MONEY, marker: '●', dash: '' } : seriesStyle(i);

  // Values per bucket, missing or non-finite entries treated as 0 in stacks
  // (an unrecorded bucket contributes nothing) and skipped in lines.
  const rows = $derived(
    bucketT.map((_, i) => {
      const r: Record<string, number> = {};
      for (const s of series) r[s.key] = finite(s.values[i]) ? s.values[i] : 0;
      return r;
    }),
  );

  const layers = $derived.by(() => {
    if (!stacked || n === 0 || series.length === 0) return null;
    return stack<Record<string, number>>()
      .keys(series.map((s) => s.key))
      .value((d, k) => d[k] ?? 0)(rows);
  });

  // --- scales ---------------------------------------------------------------
  const xDomain = $derived.by(() => {
    const ts = [...bucketT, ...(projection?.bucketT ?? [])].filter(finite);
    if (ts.length === 0) return { lo: 0, hi: 1 };
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    return hi > lo ? { lo, hi } : { lo: lo - 1, hi: hi + 1 };
  });

  const yDomain = $derived.by(() => {
    let lo = Infinity;
    let hi = -Infinity;
    if (layers) {
      for (const layer of layers)
        for (const p of layer) {
          lo = Math.min(lo, p[0], p[1]);
          hi = Math.max(hi, p[0], p[1]);
        }
    } else {
      for (const s of series)
        for (let i = 0; i < n; i++) {
          const v = s.values[i];
          if (finite(v)) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
    }
    for (const v of projection?.values ?? [])
      if (finite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    if (zeroLine || stacked) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    if (hi === lo) return { lo: lo - 1, hi: hi + 1 };
    const pad = (hi - lo) * 0.04;
    return { lo: lo - (lo < 0 || !stacked ? pad : 0), hi: hi + pad };
  });

  const x = $derived((t: number) => M.left + ((t - xDomain.lo) / (xDomain.hi - xDomain.lo)) * innerW);
  const y = $derived((v: number) => M.top + innerH - ((v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * innerH);

  // "Nice" tick step: 1, 2 or 5 × 10^k, aiming at ~4 ticks.
  function niceStep(span: number, target: number): number {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / mag;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  }
  const yTicks = $derived.by(() => {
    const span = yDomain.hi - yDomain.lo;
    if (!(span > 0)) return [];
    const step = niceStep(span, 4);
    const out: number[] = [];
    for (let v = Math.ceil(yDomain.lo / step) * step; v <= yDomain.hi + 1e-9; v += step) out.push(+v.toFixed(12));
    return out;
  });
  const xTicks = $derived.by(() => {
    const ts = [...bucketT, ...(projection?.bucketT ?? [])].filter(finite);
    if (ts.length === 0) return [];
    const uniq = Array.from(new Set(ts)).sort((a, b) => a - b);
    const count = Math.min(uniq.length, Math.max(2, Math.floor(innerW / 110)));
    if (count <= 1) return [uniq[0]];
    const out: number[] = [];
    for (let k = 0; k < count; k++) out.push(uniq[Math.round((k * (uniq.length - 1)) / (count - 1))]);
    return Array.from(new Set(out));
  });

  // --- paths ------------------------------------------------------------------
  const linePaths = $derived.by(() => {
    if (stacked || n < 2) return [];
    const gen = line<number>()
      .defined((v) => finite(v))
      .x((_, i) => x(bucketT[i]))
      .y((v) => y(v))
      .curve(curveMonotoneX);
    return series.map((s) => gen(bucketT.map((_, i) => s.values[i] ?? NaN)) ?? '');
  });

  const areaPaths = $derived.by(() => {
    if (!layers || n < 2) return [];
    const fill = area<[number, number]>()
      .x((_, i) => x(bucketT[i]))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(curveMonotoneX);
    const top = line<[number, number]>()
      .x((_, i) => x(bucketT[i]))
      .y((d) => y(d[1]))
      .curve(curveMonotoneX);
    return layers.map((layer) => {
      const pts = layer.map((p) => [p[0], p[1]] as [number, number]);
      return { fill: fill(pts) ?? '', top: top(pts) ?? '' };
    });
  });

  const projectionPath = $derived.by(() => {
    const p = projection;
    if (!p || p.bucketT.length < 2) return '';
    const gen = line<number>()
      .defined((v, i) => finite(v) && finite(p.bucketT[i]))
      .x((_, i) => x(p.bucketT[i]))
      .y((v) => y(v))
      .curve(curveMonotoneX);
    return gen(p.values.slice(0, p.bucketT.length)) ?? '';
  });

  /** Last drawn value per series (top of the stack when stacked). */
  const endValue = (si: number): number | null => {
    if (n === 0) return null;
    if (layers) {
      const p = layers[si]?.[n - 1];
      return p ? p[1] : null;
    }
    for (let i = n - 1; i >= 0; i--) {
      const v = series[si].values[i];
      if (finite(v)) return v;
    }
    return null;
  };

  // Direct labels at the line ends, nudged apart so they never overlap.
  const endLabels = $derived.by(() => {
    if (n === 0) return [];
    const items = series
      .map((s, i) => ({ s, i, v: endValue(i) }))
      .filter((d): d is { s: Series; i: number; v: number } => d.v !== null)
      .map((d) => ({ ...d, yy: y(d.v) }))
      .sort((a, b) => a.yy - b.yy);
    const MIN_GAP = 13;
    for (let k = 1; k < items.length; k++)
      if (items[k].yy - items[k - 1].yy < MIN_GAP) items[k].yy = items[k - 1].yy + MIN_GAP;
    const bottom = M.top + innerH;
    for (let k = items.length - 1; k >= 0; k--) {
      const cap = k === items.length - 1 ? bottom : items[k + 1].yy - MIN_GAP;
      if (items[k].yy > cap) items[k].yy = cap;
    }
    return items;
  });

  // --- hover -------------------------------------------------------------------
  let hover = $state<number | null>(null);

  function nearestIndex(px: number): number | null {
    if (n === 0) return null;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(bucketT[i]) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function onMove(ev: PointerEvent): void {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * width;
    hover = nearestIndex(px);
  }

  const hoverRows = $derived.by(() => {
    const i = hover;
    if (i === null || i >= n) return null;
    const t = bucketT[i];
    const list = series.map((s, si) => {
      const v = s.values[i];
      const yy = layers ? layers[si][i][1] : v;
      return { s, si, v: finite(v) ? v : null, yy: finite(yy) ? yy : null };
    });
    return { t, list, px: x(t), flip: x(t) > M.left + innerW * 0.6 };
  });

  const ariaLabel = $derived(
    `${stacked ? 'stacked ' : ''}chart, ${series.length} series over ${n} points` +
      (projection ? ', with a dashed projection' : ''),
  );
</script>

{#snippet legendKey(s: Series, st: SeriesStyle)}
  <svg width="22" height="10" aria-hidden="true">
    {#if stacked}
      <rect x="1" y="1" width="20" height="8" rx="2" fill={st.color} fill-opacity="0.75" />
    {:else}
      <line x1="1" y1="5" x2="21" y2="5" stroke={st.color} stroke-width="2" stroke-dasharray={st.dash || undefined} />
    {/if}
  </svg>
  <span class="marker mono" style:color={st.color} aria-hidden="true">{st.marker}</span>
  <span class="label">{s.label}</span>
{/snippet}

<div class="ts" bind:clientWidth>
  <div class="plot">
    <svg
      {width}
      {height}
      viewBox="0 0 {width} {height}"
      role="img"
      aria-label={ariaLabel}
      onpointermove={onMove}
      onpointerleave={() => (hover = null)}
    >
      <!-- gridlines + y labels -->
      {#each yTicks as v (v)}
        <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} stroke={COLORS.line} stroke-width="1" />
        <text x={M.left - 6} y={y(v)} class="tick mono" text-anchor="end" dominant-baseline="middle">{formatY(v)}</text>
      {/each}

      <!-- zero line -->
      {#if zeroLine && yDomain.lo <= 0 && yDomain.hi >= 0}
        <line x1={M.left} x2={M.left + innerW} y1={y(0)} y2={y(0)} stroke={COLORS['fg-muted']} stroke-width="1" />
      {/if}

      <!-- x labels -->
      {#each xTicks as t (t)}
        <text x={x(t)} y={height - 6} class="tick mono" text-anchor="middle">{formatX(t)}</text>
      {/each}

      <!-- series -->
      {#if n === 0 || series.length === 0}
        <text x={M.left + innerW / 2} y={M.top + innerH / 2} class="empty" text-anchor="middle" dominant-baseline="middle">no data</text>
      {:else if n === 1}
        {#each series as s, i (s.key)}
          {@const v = layers ? layers[i][0][1] : s.values[0]}
          {#if finite(v)}
            <circle cx={x(bucketT[0])} cy={y(v)} r="3.5" fill={styleOf(i).color} />
          {/if}
        {/each}
      {:else if layers}
        {#each areaPaths as p, i (series[i].key)}
          {@const st = styleOf(i)}
          <path d={p.fill} fill={st.color} fill-opacity="0.55" stroke="none" />
          <path d={p.top} fill="none" stroke={st.color} stroke-width="1.5" stroke-dasharray={st.dash || undefined} />
        {/each}
      {:else}
        {#each linePaths as d, i (series[i].key)}
          {@const st = styleOf(i)}
          <path {d} fill="none" stroke={st.color} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={st.dash || undefined} />
        {/each}
      {/if}

      <!-- projection: dashed, muted, a reading of the current slope -->
      {#if projectionPath}
        <path d={projectionPath} fill="none" stroke={COLORS['fg-muted']} stroke-width="1.5" stroke-dasharray="5 4" />
      {/if}

      <!-- direct labels -->
      {#each endLabels as l (l.s.key)}
        {@const st = styleOf(l.i)}
        <text x={M.left + innerW + 6} y={l.yy} class="end mono" dominant-baseline="middle">
          <tspan fill={st.color}>{st.marker}</tspan>
          <tspan class="end-text" dx="4">{l.s.label}</tspan>
        </text>
      {/each}

      <!-- crosshair -->
      {#if hoverRows}
        <line x1={hoverRows.px} x2={hoverRows.px} y1={M.top} y2={M.top + innerH} stroke={COLORS['fg-muted']} stroke-width="1" stroke-dasharray="2 2" />
        {#each hoverRows.list as r (r.s.key)}
          {#if r.yy !== null}
            <circle cx={hoverRows.px} cy={y(r.yy)} r="3" fill={COLORS['bg-0']} stroke={styleOf(r.si).color} stroke-width="1.5" />
          {/if}
        {/each}
      {/if}
    </svg>

    {#if hoverRows}
      <div
        class="tip mono"
        class:flip={hoverRows.flip}
        style:left="{(hoverRows.px / width) * 100}%"
        style:top="{M.top}px"
        role="status"
      >
        <div class="tip-t dim">{formatX(hoverRows.t)}</div>
        {#each hoverRows.list as r (r.s.key)}
          {@const st = styleOf(r.si)}
          <div class="tip-row">
            <span class="tip-marker" style:color={st.color} aria-hidden="true">{st.marker}</span>
            <span class="tip-label">{r.s.label}</span>
            <span class="tip-value" class:money={money}>{r.v === null ? '–' : formatY(r.v)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <ul class="legend" aria-label="legend">
    {#each series as s, i (s.key)}
      {@const st = styleOf(i)}
      <li>
        {#if onSeriesClick}
          <button type="button" class="key clickable" onclick={() => onSeriesClick?.(s)}>
            {@render legendKey(s, st)}
          </button>
        {:else}
          <span class="key">{@render legendKey(s, st)}</span>
        {/if}
      </li>
    {/each}
    {#if projection}
      <li>
        <span class="key">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" stroke={COLORS['fg-muted']} stroke-width="1.5" stroke-dasharray="4 3" />
          </svg>
          <span class="label dim">projection</span>
        </span>
      </li>
    {/if}
  </ul>
</div>

<style>
  .ts {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    min-width: 0;
    width: 100%;
  }
  .plot {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    touch-action: none;
  }
  .tick {
    fill: var(--fg-muted);
    font-size: 10px;
  }
  .empty {
    fill: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 12px;
  }
  .end {
    font-size: 11px;
    fill: var(--fg);
  }
  .end-text {
    fill: var(--fg);
  }
  .tip {
    position: absolute;
    transform: translateX(10px);
    background: var(--bg-3);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.35em 0.55em;
    font-size: 11px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 2;
  }
  .tip.flip {
    transform: translateX(calc(-100% - 10px));
  }
  .tip-t {
    margin-bottom: 0.2em;
  }
  .tip-row {
    display: grid;
    grid-template-columns: 1em 1fr auto;
    gap: 0.5em;
  }
  .tip-value {
    text-align: right;
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0 0 0 60px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35em 1.1em;
    font-size: 0.85em;
  }
  .key {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    color: var(--fg);
    font-family: var(--font-ui);
  }
  .key svg {
    width: 22px;
    height: 10px;
    display: inline-block;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover .label {
    text-decoration: underline;
    text-decoration-color: var(--accent);
  }
  .clickable:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .marker {
    line-height: 1;
  }
</style>
