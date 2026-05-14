<!--
  Animation-speed slider for the header.

  The slider value is the *speed factor* (1× = normal, higher = faster);
  internally we store 1/factor as the multiplier on delays. Slider goes
  0.5× (slow, multiplier 2.0) to 5× (very fast, multiplier 0.2). Default
  1× normal. Step 0.1.

  Persistence is handled by the store — every setFactor call writes to
  localStorage. The store also reads on construction, so a reload picks
  up the operator's choice automatically.
-->
<script lang="ts">
  import { speed } from "../stores/speed.svelte";

  const factor = $derived(speed.factor);

  function onInput(e: Event) {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    speed.setFactor(v);
  }
</script>

<label class="speed" title="animation speed">
  <span class="lbl">speed</span>
  <input
    type="range"
    min="0.5"
    max="5"
    step="0.1"
    value={factor}
    oninput={onInput}
    aria-label="animation speed factor"
  />
  <span class="val">{factor.toFixed(1)}×</span>
</label>

<style>
  .speed {
    display: inline-grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82em;
    color: #557755;
    user-select: none;
  }
  .lbl {
    letter-spacing: 0.1em;
    text-transform: lowercase;
    font-weight: bold;
  }
  .val {
    color: #33ff66;
    font-variant-numeric: tabular-nums;
    min-width: 2.5em;
    text-align: right;
    font-weight: bold;
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
    background: #114422;
    border-radius: 1px;
  }
  input[type=range]::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #33ff66;
    margin-top: -5px;
    box-shadow: 0 0 4px rgba(51, 255, 102, 0.6);
    border: 0;
  }
  /* Firefox */
  input[type=range]::-moz-range-track {
    height: 2px;
    background: #114422;
    border-radius: 1px;
  }
  input[type=range]::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #33ff66;
    box-shadow: 0 0 4px rgba(51, 255, 102, 0.6);
    border: 0;
  }
  input[type=range]:focus {
    outline: 0;
  }
  input[type=range]:focus::-webkit-slider-thumb {
    box-shadow: 0 0 8px rgba(51, 255, 102, 0.9);
  }
  input[type=range]:focus::-moz-range-thumb {
    box-shadow: 0 0 8px rgba(51, 255, 102, 0.9);
  }
</style>
