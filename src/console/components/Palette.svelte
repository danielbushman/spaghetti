<!--
  Palette — the ⌘K modal (plan §4.5, T9).

  A dialog over the room with one input and a listbox of rooms and fleets.
  The input owns the keys while it has focus (arrows, Enter, Esc, ⌘K) and
  stops them there so App's window handler never sees them twice; App still
  answers the same keys when the palette is open and focus has wandered.
  Every row shows a kind glyph and a hint in words: a room is a door, a
  fleet is a row of machines.
-->
<script lang="ts">
  import { palette, KIND_GLYPH } from '../stores/palette.svelte';

  let inputEl: HTMLInputElement | undefined = $state();

  // Focus the input whenever the palette opens (no `autofocus` attribute:
  // it steals focus on page load and the compiler warns about it).
  $effect(() => {
    if (palette.open && inputEl) inputEl.focus();
  });

  function onInputKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      event.stopPropagation();
      palette.toggle();
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        palette.move(1);
        break;
      case 'ArrowUp':
        palette.move(-1);
        break;
      case 'Enter':
        palette.commit();
        break;
      case 'Escape':
        palette.close();
        break;
      default:
        return; // let the character reach the input; nothing else handles it
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onInput(event: Event): void {
    palette.setQuery((event.currentTarget as HTMLInputElement).value);
  }

  function onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) palette.close();
  }

  const activeId = $derived(palette.current ? `palette-opt-${palette.current.id}` : undefined);
</script>

{#if palette.open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={onBackdrop}>
    <div class="dialog panel" role="dialog" aria-modal="true" aria-label="go to a room or a fleet">
      <input
        bind:this={inputEl}
        class="input query mono"
        type="text"
        value={palette.query}
        placeholder="room or fleet…"
        aria-label="search rooms and fleets"
        aria-controls="palette-listbox"
        aria-activedescendant={activeId}
        autocomplete="off"
        spellcheck="false"
        oninput={onInput}
        onkeydown={onInputKey}
      />
      <ul id="palette-listbox" class="list" role="listbox" aria-label="matches">
        {#each palette.matches as item, i (item.id)}
          {@const active = i === palette.index}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id="palette-opt-{item.id}"
            class="row"
            class:active
            role="option"
            aria-selected={active}
            onmouseenter={() => (palette.selected = i)}
            onclick={() => palette.commit(item)}
          >
            <span class="glyph mono" aria-hidden="true">{KIND_GLYPH[item.kind]}</span>
            <span class="kind dim">{item.kind}</span>
            <span class="label" class:mono={item.kind === 'fleet'}>{item.label}</span>
            <span class="hint dim">{item.hint}</span>
          </li>
        {:else}
          <li class="row empty dim" role="option" aria-selected="false">no match</li>
        {/each}
      </ul>
      <div class="foot dim">
        <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: color-mix(in srgb, var(--bg-0) 78%, transparent);
  }
  .dialog {
    width: min(36rem, calc(100vw - 2 * var(--gap)));
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    background: var(--bg-2);
    box-shadow: 0 16px 48px var(--bg-0);
  }
  .query {
    width: 100%;
    font-size: 1.05em;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
  }
  .row {
    display: grid;
    grid-template-columns: 1.2em 3.5em 1fr auto;
    align-items: center;
    gap: 0.6em;
    padding: 0.4em 0.5em;
    border-left: 3px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }
  .row.active {
    background: var(--accent-soft);
    border-left-color: var(--accent);
    font-weight: 600;
  }
  .row.empty {
    grid-template-columns: 1fr;
    cursor: default;
  }
  .glyph { color: var(--accent); }
  .kind { font-size: 0.8em; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { font-size: 0.85em; white-space: nowrap; }
  .foot {
    display: flex;
    gap: 1em;
    font-size: 0.8em;
    padding-top: 0.25em;
    border-top: 1px solid var(--line);
  }
</style>
