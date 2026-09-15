<!--
  StatusPill — glyph + word + tint, always all three (plan §5.1, T6).

  The glyph and the label carry the meaning; the tint is a third cue. Under
  grayscale the pill still reads. Hues are the pale status tints, never a
  chart series hue (§5.2: `bad` and `cat-6` collapse under protanopia).
-->
<script lang="ts">
  type Status = 'active' | 'paused' | 'storm' | 'breached' | 'idle' | 'good' | 'warn' | 'bad';

  let { status, label }: { status: Status; label?: string } = $props();

  const GLYPH: Record<Status, string> = {
    active: '●',
    paused: '‖',
    storm: '▲',
    breached: '✕',
    idle: '◌',
    good: '●',
    warn: '▲',
    bad: '✕',
  };

  // Which tint each status wears; paused and idle are plain muted grey.
  const TONE: Record<Status, 'good' | 'warn' | 'bad' | 'muted'> = {
    active: 'good',
    paused: 'muted',
    storm: 'warn',
    breached: 'bad',
    idle: 'muted',
    good: 'good',
    warn: 'warn',
    bad: 'bad',
  };

  const text = $derived(label ?? status);
</script>

<span class="pill status tone-{TONE[status]}" data-status={status} aria-label="status: {text}">
  <span class="glyph" aria-hidden="true">{GLYPH[status]}</span>
  <span class="text">{text}</span>
</span>

<style>
  .status {
    font-family: var(--font-ui);
    color: var(--fg);
  }
  .glyph {
    font-family: var(--font-data);
    line-height: 1;
  }
  .tone-good .glyph { color: var(--good); }
  .tone-warn .glyph { color: var(--warn); }
  .tone-bad .glyph { color: var(--bad); }
  .tone-muted .glyph { color: var(--fg-muted); }
  .tone-good { border-color: var(--good); }
  .tone-warn { border-color: var(--warn); }
  .tone-bad { border-color: var(--bad); }
  .tone-muted { color: var(--fg-muted); }
</style>
