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
  select {
    background: #001a0d;
    color: #33ff66;
    border: 1px solid #114422;
    padding: 0.2rem 0.4rem;
    font-family: inherit;
    font-size: 0.85em;
    width: 100%;
    cursor: pointer;
  }
  select:focus {
    outline: 0;
    border-color: #33ff66;
    box-shadow: 0 0 6px rgba(51, 255, 102, 0.3);
  }
</style>
