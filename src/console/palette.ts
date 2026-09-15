/**
 * JS mirror of the colour tokens in `theme.css` (plan §5.1, T6).
 *
 * MUST MIRROR `theme.css` BYTE-FOR-BYTE. `tests/console/palette.test.ts`
 * parses the `:root` block of the stylesheet and compares every token here
 * against it, so a drift in either file fails the suite.
 *
 * Why a mirror exists at all: inline SVG presentation attributes cannot read
 * CSS custom properties, so charts (`TimeSeries`, `BarList` markers) take
 * their hexes from here. Everything HTML-side uses `var(--token)`.
 *
 * Rules the tokens encode (§5.1):
 *  - `money` is Okabe–Ito yellow and belongs to cash, runway and $ columns.
 *    It is never a chart series and never a status.
 *  - `good` / `warn` / `bad` are pale tints, always paired with a glyph and
 *    a word. They share no hex with any series or tier colour.
 *  - `cat-1..7` are Okabe–Ito minus yellow: fills, strokes and swatches only.
 *  - Tier colours alias series hues, never status hues.
 */
import type { Tier } from '../sim/types';

export const COLORS = {
  'bg-0': '#0D0D12',
  'bg-1': '#111118',
  'bg-2': '#141420',
  'bg-3': '#1B1B2A',
  line: '#262636',
  fg: '#E8E6F0',
  'fg-muted': '#9A98A8',
  accent: '#9B6DFF',
  'accent-soft': 'rgba(155,109,255,.18)',
  electric: '#B8F0FF',
  money: '#F0E442',
  good: '#A6D8FF',
  warn: '#FFB454',
  bad: '#FF6FA3',
  'cat-1': '#0072B2',
  'cat-2': '#E69F00',
  'cat-3': '#56B4E9',
  'cat-4': '#009E73',
  'cat-5': '#D55E00',
  'cat-6': '#CC79A7',
  'cat-7': '#999999',
} as const;

export type ColorToken = keyof typeof COLORS;

/** Cash, runway, spend totals, $ columns. Always with a "$". */
export const MONEY: string = COLORS.money;

/** Chart series hues in order. Fills, strokes and swatches only — never text, never status. */
export const SERIES: readonly string[] = [
  COLORS['cat-1'],
  COLORS['cat-2'],
  COLORS['cat-3'],
  COLORS['cat-4'],
  COLORS['cat-5'],
  COLORS['cat-6'],
  COLORS['cat-7'],
];

/** Legend marker glyph per series index; a second cue beside the hue. */
export const MARKERS: readonly string[] = ['●', '▲', '■', '◆', '▼', '⬟', '○'];

/**
 * SVG `stroke-dasharray` per series index. The first three series are solid;
 * from index 3 on the dash pattern is a third cue (hue, marker, dash).
 */
export const DASHES: readonly string[] = ['', '', '', '6 3', '2 3', '8 3 2 3', '1 3'];

export interface SeriesStyle {
  color: string;
  marker: string;
  dash: string;
}

/** Style for series `i`; wraps past the seventh so a long legend never throws. */
export function seriesStyle(i: number): SeriesStyle {
  const n = SERIES.length;
  const k = ((Math.trunc(i) % n) + n) % n;
  return { color: SERIES[k], marker: MARKERS[k], dash: DASHES[k] };
}

/** Tier swatch colours: aliases of series hues (§5.1), always shown with the letter and the name. */
export const TIER_COLOR: Record<Tier, string> = {
  small: COLORS['cat-3'],
  medium: COLORS['cat-1'],
  frontier: COLORS['cat-5'],
};

export const TIER_LETTER: Record<Tier, string> = { small: 'S', medium: 'M', frontier: 'F' };

// ---------------------------------------------------------------------------
// WCAG 2.x helpers (used by the palette test and available to components)
// ---------------------------------------------------------------------------

/** Parse `#RGB` or `#RRGGBB` into 0–255 channels. Throws on anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`palette: not a hex colour: ${hex}`);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance (WCAG 2.x, sRGB), 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG contrast ratio between two hex colours, ≥ 1. Order does not matter. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
