<!--
  Compact master-volume slider for the header. Same subdued-by-default
  / brightens-on-hover treatment as the SpeedSlider — this is an
  advanced setting, not a call to action. Backed by the audio store,
  which persists to localStorage and ramps the engine's master gain
  smoothly on each change.
-->
<script lang="ts">
  import { audio } from "../audio";

  function onInput(e: Event): void {
    audio.setVolume((e.target as HTMLInputElement).valueAsNumber);
  }
</script>

<label class="volume" title="audio volume">
  <span class="lbl">vol</span>
  <input
    type="range"
    min="0"
    max="1"
    step="0.02"
    value={audio.volume}
    oninput={onInput}
    aria-label="master volume"
  />
</label>

<style>
  .volume {
    display: inline-grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82em;
    color: #3a553a;
    user-select: none;
    transition: color 200ms ease;
  }
  .volume:hover { color: #557755; }
  .lbl {
    letter-spacing: 0.1em;
    text-transform: lowercase;
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

  .volume:hover input[type=range]::-webkit-slider-runnable-track,
  input[type=range]:focus::-webkit-slider-runnable-track {
    background: #114422;
  }
  .volume:hover input[type=range]::-webkit-slider-thumb,
  input[type=range]:focus::-webkit-slider-thumb {
    background: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.7);
    transform: scale(1.1);
  }
  .volume:hover input[type=range]::-moz-range-track,
  input[type=range]:focus::-moz-range-track {
    background: #114422;
  }
  .volume:hover input[type=range]::-moz-range-thumb,
  input[type=range]:focus::-moz-range-thumb {
    background: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.7);
    transform: scale(1.1);
  }
  input[type=range]:focus { outline: 0; }
</style>
