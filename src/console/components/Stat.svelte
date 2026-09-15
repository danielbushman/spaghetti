<!--
  Stat — a headline tile: sans label, big mono value, optional sub-line,
  optional 28-point sparkline (plan §4.4, §7 T6).

  `tone` colours the value (money = Okabe–Ito yellow, always with its "$").
  `status`, when given, renders a StatusPill beside the value, so a tile that
  flips to good/warn/bad always says so with a glyph and a word — never the
  hue alone. `goodWhen` turns the sparkline's trend into a `▲ up` / `▼ down`
  reading with the matching tint; again glyph + word first.

  Number roll: the value is a formatted string, so the "roll" is a spring
  slide of the real new value into place, not an interpolated fake number
  (real terms never lie). Honours `prefers-reduced-motion`; skips when rAF
  is unavailable.
-->
<script lang="ts">
  import Sparkline from '../../client/components/Sparkline.svelte';
  import StatusPill from './StatusPill.svelte';
  import { animateSpring, SPRINGS } from '../../client/motion/spring';

  type Tone = 'money' | 'neutral' | 'good' | 'warn' | 'bad';
  type Status = 'good' | 'warn' | 'bad';

  let {
    label,
    value,
    sub,
    history,
    tone = 'neutral',
    status,
    goodWhen,
    href,
  }: {
    label: string;
    value: string;
    sub?: string;
    history?: number[];
    tone?: Tone;
    status?: Status;
    goodWhen?: 'up' | 'down';
    href?: string;
  } = $props();

  // --- trend reading from the history's ends ------------------------------
  const trend = $derived.by(() => {
    if (!goodWhen || !history || history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    const span = Math.max(Math.abs(first), Math.abs(last), 1e-9);
    const rel = (last - first) / span;
    if (Math.abs(rel) < 0.01) return { glyph: '–', word: 'flat', tone: 'muted' as const };
    const up = rel > 0;
    const isGood = up === (goodWhen === 'up');
    return { glyph: up ? '▲' : '▼', word: up ? 'up' : 'down', tone: isGood ? ('good' as const) : ('bad' as const) };
  });

  // --- value roll ----------------------------------------------------------
  let valueEl: HTMLElement | undefined = $state();
  let lastValue: string | null = null; // null until the first render; no roll on mount
  let cancelRoll: (() => void) | null = null;

  function reducedMotion(): boolean {
    return (
      typeof requestAnimationFrame !== 'function' ||
      (typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  $effect(() => {
    const v = value; // tracked
    const previous = lastValue;
    lastValue = v;
    const el = valueEl;
    if (previous === null || v === previous || !el || reducedMotion()) return;
    if (cancelRoll) cancelRoll();
    cancelRoll = animateSpring((p) => {
      const q = Math.max(0, Math.min(1, p));
      el.style.transform = q >= 1 ? '' : `translateY(${(1 - q) * 8}px)`;
      el.style.opacity = q >= 1 ? '' : String(0.35 + 0.65 * q);
    }, SPRINGS.noWobble);
    return () => {
      if (cancelRoll) cancelRoll();
      cancelRoll = null;
    };
  });
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  class="stat tone-{tone}"
  class:door={!!href}
  href={href || undefined}
  aria-label="{label}: {value}{sub ? `, ${sub}` : ''}"
>
  <div class="label">{label}</div>
  <div class="row">
    <span class="value mono" bind:this={valueEl}>{value}</span>
    {#if status}
      <StatusPill {status} />
    {/if}
  </div>
  {#if sub}
    <div class="sub dim">{sub}</div>
  {/if}
  {#if history && history.length > 0}
    <div class="spark">
      <span class="line"><Sparkline values={history} width={96} height={18} /></span>
      {#if trend}
        <span class="trend trend-{trend.tone}">
          <span class="glyph mono" aria-hidden="true">{trend.glyph}</span>
          <span class="word">{trend.word}</span>
        </span>
      {/if}
    </div>
  {/if}
  {#if href}
    <span class="arrow dim" aria-hidden="true">→</span>
  {/if}
</svelte:element>

<style>
  .stat {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    padding: var(--gap);
    background: var(--bg-1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--fg);
    min-width: 0;
  }
  .door {
    cursor: pointer;
    text-decoration: none;
  }
  .door:hover {
    border-color: var(--accent);
    text-decoration: none;
  }
  .label {
    font-family: var(--font-ui);
    font-size: 0.8em;
    color: var(--fg-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.6em;
    flex-wrap: wrap;
  }
  .value {
    font-size: 1.7em;
    font-weight: 600;
    line-height: 1.1;
    display: inline-block;
    will-change: transform, opacity;
  }
  .tone-money .value { color: var(--money); }
  .tone-good .value { color: var(--good); }
  .tone-warn .value { color: var(--warn); }
  .tone-bad .value { color: var(--bad); }
  .tone-neutral .value { color: var(--fg); }
  .sub {
    font-size: 0.85em;
  }
  .spark {
    display: flex;
    align-items: center;
    gap: 0.6em;
    margin-top: 0.35em;
    color: var(--fg-muted);
  }
  .tone-money .spark .line { color: var(--money); }
  .trend {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-size: 0.8em;
    color: var(--fg-muted);
  }
  .trend-good .glyph { color: var(--good); }
  .trend-bad .glyph { color: var(--bad); }
  .arrow {
    position: absolute;
    top: var(--gap);
    right: var(--gap);
  }
</style>
