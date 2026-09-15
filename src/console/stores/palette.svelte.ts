/**
 * ⌘K palette state (plan §4.5, T9). A thin rune wrapper: the matching is
 * `palette/fuzzy.ts` (pure, unit-tested); the items are the rail's rooms
 * plus every fleet from `game.run.paletteFleets()`; committing navigates
 * through the router, so the palette is a keyboard door, never a lever.
 */
import { ROOMS, href } from '../router';
import { router } from '../router.svelte';
import { rank } from '../palette/fuzzy';
import { game } from './game.svelte';

export interface PaletteItem {
  id: string;
  kind: 'room' | 'fleet';
  /** What the row shows. */
  label: string;
  /** Second line: the chord for a room, the role for a fleet. */
  hint: string;
  /** What the fuzzy matcher scores. */
  text: string;
  href: string;
}

/** Rows shown at most. */
export const PALETTE_LIMIT = 12;

/** Kind glyphs: a room is a door, a fleet is a row of machines. Text beside them always. */
export const KIND_GLYPH: Record<PaletteItem['kind'], string> = { room: '▸', fleet: '▦' };

class PaletteStore {
  open = $state(false);
  query = $state('');
  /** Raw cursor; read `index` for the clamped value. */
  selected = $state(0);

  items: PaletteItem[] = $derived.by(() => {
    void game.state; // fleets change with the run (new run, new seed)
    const rooms: PaletteItem[] = ROOMS.map((r) => ({
      id: `room:${r.room}`,
      kind: 'room',
      label: r.label,
      hint: r.hotkey,
      text: `${r.label} ${r.room}`,
      href: href({ room: r.room }),
    }));
    const fleets: PaletteItem[] = game.run.paletteFleets().map((f) => ({
      id: `fleet:${f.id}`,
      kind: 'fleet',
      label: f.name,
      hint: f.role,
      text: `${f.name} ${f.role}`,
      href: href({ room: 'fleet', id: f.id }),
    }));
    return [...rooms, ...fleets];
  });

  matches: PaletteItem[] = $derived(rank(this.query, this.items, (i) => i.text, PALETTE_LIMIT));

  /** The cursor clamped into `matches`; −1 when there is nothing to select. */
  get index(): number {
    const n = this.matches.length;
    if (n === 0) return -1;
    return Math.min(Math.max(0, this.selected), n - 1);
  }

  get current(): PaletteItem | null {
    const i = this.index;
    return i < 0 ? null : this.matches[i];
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.query = '';
    this.selected = 0;
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.query = '';
    this.selected = 0;
  }

  setQuery(q: string): void {
    this.query = q;
    this.selected = 0;
  }

  /** Move the cursor by `delta`, wrapping at both ends. */
  move(delta: number): void {
    const n = this.matches.length;
    if (n === 0) return;
    const i = this.index;
    this.selected = (((i + delta) % n) + n) % n;
  }

  /** Navigate to the selected row (or `item`) and close. */
  commit(item: PaletteItem | null = this.current): void {
    if (!item) return;
    router.navigate(item.href);
    this.close();
  }
}

export const palette = new PaletteStore();
