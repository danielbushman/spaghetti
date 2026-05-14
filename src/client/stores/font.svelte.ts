/**
 * Font choice store. Picks from a curated set of monospace fonts loaded
 * via Google Fonts in index.html. The selection is sticky via
 * localStorage['spaghetti.font'].
 *
 * The store exposes `current` (the active FontChoice). An $effect in
 * App.svelte writes its `family` (and any font-variation-settings) onto
 * a CSS custom property on documentElement, which the global body rule
 * reads via var(--font-mono).
 */

export type FontChoice = {
  id: string;
  /** Display label in the dropdown. */
  label: string;
  /** The full CSS font-family stack (with fallbacks). */
  family: string;
};

/**
 * Six fonts that span the personality spectrum. All on Google Fonts.
 * Order roughly: most stylized "modern" → most pixelated retro.
 */
export const FONT_CHOICES: readonly FontChoice[] = [
  { id: "space-mono", label: "Space Mono",      family: "'Space Mono', monospace" },
  { id: "jetbrains",  label: "JetBrains Mono",  family: "'JetBrains Mono', monospace" },
  { id: "plex",       label: "IBM Plex Mono",   family: "'IBM Plex Mono', monospace" },
  { id: "cutive",     label: "Cutive Mono",     family: "'Cutive Mono', monospace" },
  { id: "vt323",      label: "VT323 — CRT",     family: "'VT323', monospace" },
  { id: "major",      label: "Major Mono",      family: "'Major Mono Display', monospace" },
];

const DEFAULT = FONT_CHOICES[0];
const KEY = "spaghetti.font";

function readStored(): FontChoice {
  if (typeof localStorage === "undefined") return DEFAULT;
  try {
    const id = localStorage.getItem(KEY);
    if (id) {
      const found = FONT_CHOICES.find((f) => f.id === id);
      if (found) return found;
    }
  } catch {
    /* private mode, storage disabled */
  }
  return DEFAULT;
}

class FontStore {
  current = $state<FontChoice>(readStored());

  set(id: string): void {
    const found = FONT_CHOICES.find((f) => f.id === id);
    if (!found) return;
    this.current = found;
    try { localStorage.setItem(KEY, id); } catch {}
  }
}

export const font = new FontStore();
