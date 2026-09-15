<!--
  App — the console shell (plan §4.5, §7 T9).

  Layout: rail | (top bar / room). The room is keyed on the route's href so
  panels re-reveal when the door changes. All global keys live here:
    ⌘K / Ctrl+K   toggle the palette
    open:         ↑ ↓ move · Enter open · Esc close (the input handles its
                  own copy of these and stops them; this is the fallback
                  for when focus has wandered off the input)
    closed:       g then o | f | r | s within 500 ms → a room
                  Space → pause / resume, only when focus is on <body>
  Keys are ignored while composing and when the target is an input, select,
  textarea or contenteditable — typing "go small" into a rule note never
  navigates.
-->
<script lang="ts">
  import './theme.css';
  import { onMount } from 'svelte';
  import { router } from './router.svelte';
  import { ROOMS, href, type Room } from './router';
  import { game } from './stores/game.svelte';
  import { palette } from './stores/palette.svelte';
  import Rail from './components/Rail.svelte';
  import TopBar from './components/TopBar.svelte';
  import Palette from './components/Palette.svelte';
  import Overview from './rooms/Overview.svelte';
  import Fleets from './rooms/Fleets.svelte';
  import FleetDetail from './rooms/FleetDetail.svelte';
  import Routing from './rooms/Routing.svelte';
  import Spend from './rooms/Spend.svelte';

  /** A `g` chord waits this long for its second key. */
  const CHORD_MS = 500;

  const CHORD_ROOM: Record<string, Room> = { o: 'overview', f: 'fleets', r: 'routing', s: 'spend' };

  const railRooms = ROOMS.map((r) => ({ ...r, href: href({ room: r.room }) }));

  const route = $derived(router.current);
  const routeKey = $derived(href(route));

  onMount(() => {
    router.start();
    game.boot();
    game.startClock();
    // TODO(intro): when game.run.isFirstLogin, play the intro sequence
    // (src/client/components/BootFlicker etc.) before revealing Overview.
    return () => {
      game.stopClock();
      router.stop();
    };
  });

  // Once, when the run goes bankrupt.
  let bankruptHandled = false;
  $effect(() => {
    if (!game.isBankrupt) {
      bankruptHandled = false;
      return;
    }
    if (bankruptHandled) return;
    bankruptHandled = true;
    // TODO(prestige): onBankrupt(game.state) — the post-mortem reads the final state.
  });

  // --- keys -------------------------------------------------------------------
  let chordTimer: ReturnType<typeof setTimeout> | null = null;
  let chordArmed = false;

  function armChord(): void {
    chordArmed = true;
    if (chordTimer !== null) clearTimeout(chordTimer);
    chordTimer = setTimeout(() => {
      chordArmed = false;
      chordTimer = null;
    }, CHORD_MS);
  }

  function disarmChord(): void {
    chordArmed = false;
    if (chordTimer !== null) clearTimeout(chordTimer);
    chordTimer = null;
  }

  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    return target.closest('[contenteditable]') !== null;
  }

  function onKey(event: KeyboardEvent): void {
    if (event.isComposing || isTyping(event.target)) return;

    const meta = event.metaKey || event.ctrlKey;
    if (meta && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      palette.toggle();
      return;
    }
    if (meta || event.altKey) return;

    if (palette.open) {
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
          return;
      }
      event.preventDefault();
      return;
    }

    if (chordArmed) {
      const room = CHORD_ROOM[event.key];
      disarmChord();
      if (room) {
        event.preventDefault();
        router.navigate({ room });
      }
      return;
    }
    if (event.key === 'g') {
      armChord();
      return;
    }
    if (event.key === ' ' && typeof document !== 'undefined' && event.target === document.body) {
      event.preventDefault();
      if (game.paused) game.resume();
      else game.pause();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <aside class="rail-slot">
    <Rail current={route.room} rooms={railRooms} />
  </aside>
  <div class="main">
    <TopBar />
    <main class="room" aria-live="polite">
      {#key routeKey}
        {#if route.room === 'overview'}
          <Overview />
        {:else if route.room === 'fleets'}
          <Fleets />
        {:else if route.room === 'fleet'}
          <FleetDetail />
        {:else if route.room === 'routing'}
          <Routing />
        {:else if route.room === 'spend'}
          <Spend />
        {/if}
      {/key}
    </main>
  </div>
  <Palette />
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: auto 1fr;
    height: 100%;
    min-height: 100vh;
    background: var(--bg-0);
    color: var(--fg);
  }
  .rail-slot {
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .room {
    flex: 1;
    min-width: 0;
    padding: calc(var(--gap) * 1.5);
  }
</style>
