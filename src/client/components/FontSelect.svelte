<!--
  Font picker for the header. Native <select> for keyboard-friendly UX;
  the option list lives in the FONT_CHOICES export of the font store.
  Selecting an option updates the store, which writes localStorage and
  flips a CSS custom property in App.svelte's $effect.

  Each option label is rendered in *its own font* — most browsers honour
  font-family on <option> in the open dropdown panel, so the operator
  can preview the styles before committing. (Some platforms render the
  closed-select label using the inherited font; that's fine — once
  selected, the whole UI swaps.)
-->
<script lang="ts">
  import { font, FONT_CHOICES } from "../stores/font.svelte";

  function onChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    font.set(v);
  }
</script>

<select
  value={font.current.id}
  onchange={onChange}
  aria-label="font family"
  title="font"
>
  {#each FONT_CHOICES as f (f.id)}
    <option value={f.id} style="font-family: {f.family};">{f.label}</option>
  {/each}
</select>

<style>
  /*
    Subdued by default — this is an advanced setting, not a primary
    action. Muted text + faint border. Hover/focus brightens for clear
    interactive affordance.
  */
  select {
    background: #060c08;
    color: #557755;
    border: 1px solid #1a3322;
    padding: 0.2rem 0.4rem;
    font-family: inherit;
    font-size: 0.85em;
    width: 100%;
    cursor: pointer;
    transition: color 200ms ease, border-color 200ms ease, background 200ms ease;
  }
  select:hover {
    color: #33ff66;
    border-color: #33ff66;
    background: #001a0d;
  }
  select:focus {
    outline: 0;
    color: #33ff66;
    border-color: #33ff66;
    background: #001a0d;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.3);
  }
</style>
