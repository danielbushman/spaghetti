<!--
  Animation-speed slider for the header.

  Slider value 0..100 maps to factor FACTOR_MIN..FACTOR_MAX (0.5×..200×)
  via a logarithmic curve. Linear mapping would give 1× a single-pixel
  range — log makes the low end usable while still reaching 200× at the
  far right.

  Visual: subdued by default (this is an "advanced setting", not a call
  to action). Track barely visible, thumb muted green, value display
  dim. Hovering or focusing the control brightens everything to the
  saturated terminal-green and adds a soft glow on the thumb.

  Persistence is handled by the store — every setFactor call writes to
  localStorage; the store reads on construction.
-->
<script lang="ts">
  import { speed, FACTOR_MIN, FACTOR_MAX } from "../stores/speed.svelte";

  const SLIDER_RANGE = 100;
  const LN_RATIO = Math.log(FACTOR_MAX / FACTOR_MIN);

  /** Slider position 0..100 → factor on a log curve. */
  function sliderToFactor(s: number): number {
    const t = s / SLIDER_RANGE;
    return FACTOR_MIN * Math.exp(t * LN_RATIO);
  }

  /** Factor → slider position 0..100. Inverse of sliderToFactor. */
  function factorToSlider(f: number): number {
    return (Math.log(f / FACTOR_MIN) / LN_RATIO) * SLIDER_RANGE;
  }

  function formatFactor(f: number): string {
    if (f >= 10) return Math.round(f) + "×";
    if (f >= 1) return f.toFixed(1) + "×";
    return f.toFixed(2) + "×";
  }

  const sliderValue = $derived(factorToSlider(speed.factor));

  function onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    speed.setFactor(sliderToFactor(v));
  }
</script>

<label class="speed" title="animation speed">
  <span class="lbl">speed</span>
  <input
    type="range"
    min="0"
    max={SLIDER_RANGE}
    step="0.5"
    value={sliderValue}
    oninput={onInput}
    aria-label="animation speed factor"
  />
  <span class="val">{formatFactor(speed.factor)}</span>
</label>

<style>
  .speed {
    display: inline-grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82em;
    color: #3a553a;
    user-select: none;
    transition: color 200ms ease;
  }
  .speed:hover { color: #557755; }
  .lbl {
    letter-spacing: 0.1em;
    text-transform: lowercase;
    font-weight: bold;
  }
  .val {
    color: #446644;
    font-variant-numeric: tabular-nums;
    min-width: 3em;
    text-align: right;
    font-weight: bold;
    transition: color 200ms ease, text-shadow 200ms ease;
  }
  .speed:hover .val,
  .speed:focus-within .val {
    color: #33ff66;
    text-shadow: 0 0 4px rgba(51, 255, 102, 0.4);
  }

  input[type=range] {
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    width: 100%;
    margin: 0;
    cursor: pointer;
  }
  /* WebKit track + thumb */
  input[type=range]::-webkit-slider-runnable-track {
    height: 2px;
    background: #0c1f12;
    border-radius: 1px;
    transition: background 200ms ease;
  }
  input[type=range]::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #2a4a30;
    margin-top: -4.5px;
    box-shadow: none;
    border: 0;
    transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  }
  /* Firefox */
  input[type=range]::-moz-range-track {
    height: 2px;
    background: #0c1f12;
    border-radius: 1px;
    transition: background 200ms ease;
  }
  input[type=range]::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #2a4a30;
    box-shadow: none;
    border: 0;
    transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  }

  /* Hover / focus — bright thumb with glow. */
  .speed:hover input[type=range]::-webkit-slider-runnable-track,
  input[type=range]:focus::-webkit-slider-runnable-track {
    background: #114422;
  }
  .speed:hover input[type=range]::-webkit-slider-thumb,
  input[type=range]:focus::-webkit-slider-thumb {
    background: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.7);
    transform: scale(1.1);
  }
  .speed:hover input[type=range]::-moz-range-track,
  input[type=range]:focus::-moz-range-track {
    background: #114422;
  }
  .speed:hover input[type=range]::-moz-range-thumb,
  input[type=range]:focus::-moz-range-thumb {
    background: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.7);
    transform: scale(1.1);
  }
  input[type=range]:focus { outline: 0; }
</style>
