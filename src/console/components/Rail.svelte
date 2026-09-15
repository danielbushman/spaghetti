<!--
  Rail — the vertical room navigation (plan §7 T6).

  The active room is marked three ways so it never reads by colour alone:
  a 3 px accent bar on the left, bold text, and `aria-current="page"`.
  Each item shows its `g x` chord hint; the ⌘K hint sits at the bottom.
  Presentational: takes the current room and the room list as props.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Mirrors `Room` in `src/console/router.ts` (T5) so this file compiles without it. */
  type Room = 'overview' | 'fleets' | 'fleet' | 'routing' | 'spend';

  interface RailRoom {
    room: Room;
    label: string;
    hotkey: string;
    href: string;
  }

  let {
    current,
    rooms,
    footer,
  }: {
    current: Room;
    rooms: RailRoom[];
    footer?: Snippet;
  } = $props();

  // Fleet detail lives under Fleets in the rail.
  const activeRoom = $derived<Room>(current === 'fleet' ? 'fleets' : current);
</script>

<nav class="rail" aria-label="rooms">
  <div class="brand">
    <span class="mark" aria-hidden="true">▙</span>
    <span class="name">spaghetti</span>
  </div>

  <ul class="rooms">
    {#each rooms as r (r.room)}
      {@const active = r.room === activeRoom}
      <li>
        <a
          class="room"
          class:active
          href={r.href}
          aria-current={active ? 'page' : undefined}
        >
          <span class="bar" aria-hidden="true"></span>
          <span class="label">{r.label}</span>
          <kbd class="hint" aria-label="shortcut {r.hotkey}">{r.hotkey}</kbd>
        </a>
      </li>
    {/each}
  </ul>

  <div class="foot">
    {#if footer}
      {@render footer()}
    {/if}
    <div class="palette-hint dim">
      <kbd>⌘K</kbd> <span>search</span>
    </div>
  </div>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 12rem;
    padding: var(--gap) 0;
    background: var(--bg-1);
    border-right: 1px solid var(--line);
    font-family: var(--font-ui);
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
    padding: 0 var(--gap) var(--gap);
    color: var(--fg-muted);
    font-size: 0.85em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .mark { color: var(--accent); }
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .room {
    position: relative;
    display: grid;
    grid-template-columns: 3px 1fr auto;
    align-items: center;
    gap: 0.6em;
    padding: 0.45em var(--gap) 0.45em 0;
    color: var(--fg-muted);
    text-decoration: none;
  }
  .room:hover {
    color: var(--fg);
    background: var(--bg-2);
    text-decoration: none;
  }
  .bar {
    width: 3px;
    align-self: stretch;
    border-radius: 0 2px 2px 0;
    background: transparent;
  }
  .room.active {
    color: var(--fg);
    font-weight: 700;
  }
  .room.active .bar { background: var(--accent); }
  .hint {
    font-size: 0.75em;
    opacity: 0.8;
  }
  .foot {
    margin-top: auto;
    padding: var(--gap) var(--gap) 0;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  .palette-hint {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.85em;
  }
</style>
