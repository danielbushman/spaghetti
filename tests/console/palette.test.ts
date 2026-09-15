/**
 * Palette contract (plan §5.1, §5.2, §6 T6).
 *
 *   bun test tests/console/palette.test.ts
 *
 * Re-checks the WCAG contrast rows of §5.2, the colour-role disjointness
 * that makes the console colorblind-safe (status hues are never series or
 * tier hues; money is never a series), that `palette.ts` mirrors
 * `theme.css` token for token, and the fuzzy matcher's ranking.
 */
import { describe, expect, test } from 'bun:test';
import {
  COLORS,
  DASHES,
  MARKERS,
  MONEY,
  SERIES,
  TIER_COLOR,
  TIER_LETTER,
  contrast,
  hexToRgb,
  luminance,
  seriesStyle,
} from '../../src/console/palette';
import { fuzzyScore, rank } from '../../src/console/palette/fuzzy';

const THEME_PATH = new URL('../../src/console/theme.css', import.meta.url).pathname;

const lower = (s: string): string => s.toLowerCase();
const STATUS = [COLORS.good, COLORS.warn, COLORS.bad].map(lower);

/** The §5.2 table: token → [hex, vs bg-1, vs bg-2]. */
const TEXT_ROWS: [keyof typeof COLORS, string, number, number][] = [
  ['fg', '#E8E6F0', 15.2, 14.8],
  ['fg-muted', '#9A98A8', 6.7, 6.5],
  ['accent', '#9B6DFF', 5.4, 5.2],
  ['money', '#F0E442', 14.2, 13.8],
  ['good', '#A6D8FF', 12.4, 12.1],
  ['warn', '#FFB454', 10.7, 10.3],
  ['bad', '#FF6FA3', 7.2, 7.0],
  ['electric', '#B8F0FF', 15.2, 14.7],
];
const FILL_ROWS: [keyof typeof COLORS, string, number, number][] = [
  ['cat-1', '#0072B2', 3.6, 3.5],
  ['cat-4', '#009E73', 5.5, 5.3],
  ['cat-5', '#D55E00', 4.9, 4.7],
];

describe('WCAG helpers', () => {
  test('luminance spans black to white and reads 3-digit hexes', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(luminance('#fff')).toBeCloseTo(luminance('#ffffff'), 12);
    expect(hexToRgb('#0072B2')).toEqual([0, 114, 178]);
    expect(() => luminance('rgba(1,2,3,.5)')).toThrow();
  });

  test('contrast is symmetric and 21:1 at the extremes', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 6);
    expect(contrast(COLORS.fg, COLORS['bg-1'])).toBeCloseTo(contrast(COLORS['bg-1'], COLORS.fg), 12);
    expect(contrast('#808080', '#808080')).toBe(1);
  });
});

describe('§5.2 contrast rows', () => {
  for (const [token, hex, vsBg1, vsBg2] of TEXT_ROWS) {
    test(`${token} ${hex}: text on bg-1 / bg-2 ≥ 4.5 and matches the table`, () => {
      expect(String(COLORS[token])).toBe(hex);
      const c1 = contrast(hex, COLORS['bg-1']);
      const c2 = contrast(hex, COLORS['bg-2']);
      expect(c1).toBeGreaterThanOrEqual(4.5);
      expect(c2).toBeGreaterThanOrEqual(4.5);
      expect(Math.round(c1 * 10) / 10).toBeCloseTo(vsBg1, 5);
      expect(Math.round(c2 * 10) / 10).toBeCloseTo(vsBg2, 5);
    });
  }

  for (const [token, hex, vsBg1, vsBg2] of FILL_ROWS) {
    test(`${token} ${hex}: fill on bg-1 / bg-2 matches the table`, () => {
      expect(String(COLORS[token])).toBe(hex);
      expect(Math.round(contrast(hex, COLORS['bg-1']) * 10) / 10).toBeCloseTo(vsBg1, 5);
      expect(Math.round(contrast(hex, COLORS['bg-2']) * 10) / 10).toBeCloseTo(vsBg2, 5);
    });
  }

  test('every series colour clears 3:1 (non-text) on bg-1 and bg-2', () => {
    for (const hex of SERIES) {
      expect(contrast(hex, COLORS['bg-1'])).toBeGreaterThanOrEqual(3);
      expect(contrast(hex, COLORS['bg-2'])).toBeGreaterThanOrEqual(3);
    }
  });

  test('each status tint out-contrasts its series cousin (the second cue beside the glyph)', () => {
    // §5.2: good / cat-3, warn / cat-2, bad / cat-6 share a hue family but not a hex;
    // the tint always reads lighter than the series it resembles.
    const pairs: [string, string][] = [
      [COLORS.good, COLORS['cat-3']],
      [COLORS.warn, COLORS['cat-2']],
      [COLORS.bad, COLORS['cat-6']],
    ];
    for (const [tint, cousin] of pairs) {
      expect(lower(tint)).not.toBe(lower(cousin));
      expect(luminance(tint)).toBeGreaterThan(luminance(cousin));
      expect(contrast(tint, COLORS['bg-1'])).toBeGreaterThan(contrast(cousin, COLORS['bg-1']));
    }
  });
});

describe('colour roles are disjoint', () => {
  test('SERIES is the seven Okabe–Ito hues minus yellow, in order', () => {
    expect(SERIES).toEqual(['#0072B2', '#E69F00', '#56B4E9', '#009E73', '#D55E00', '#CC79A7', '#999999']);
  });

  test('SERIES never contains the money hex', () => {
    expect(SERIES.map(lower)).not.toContain(lower(MONEY));
    expect(MONEY).toBe(COLORS.money);
  });

  test('SERIES ∩ { good, warn, bad } = ∅', () => {
    for (const hex of SERIES) expect(STATUS).not.toContain(lower(hex));
  });

  test('tier colours ∩ { good, warn, bad } = ∅ and every tier colour is a series hue', () => {
    const series = SERIES.map(lower);
    for (const hex of Object.values(TIER_COLOR)) {
      expect(STATUS).not.toContain(lower(hex));
      expect(series).toContain(lower(hex));
    }
    expect(TIER_COLOR).toEqual({ small: COLORS['cat-3'], medium: COLORS['cat-1'], frontier: COLORS['cat-5'] });
    expect(TIER_LETTER).toEqual({ small: 'S', medium: 'M', frontier: 'F' });
  });

  test('status tints are distinct from each other and from money', () => {
    expect(new Set(STATUS).size).toBe(3);
    expect(STATUS).not.toContain(lower(MONEY));
  });
});

describe('series styling', () => {
  test('MARKERS are seven distinct glyphs', () => {
    expect(MARKERS).toHaveLength(7);
    expect(new Set(MARKERS).size).toBe(7);
    for (const m of MARKERS) expect(m.length).toBeGreaterThan(0);
  });

  test('DASHES: solid for 0–2, a distinct pattern from index 3', () => {
    expect(DASHES).toEqual(['', '', '', '6 3', '2 3', '8 3 2 3', '1 3']);
    const patterned = DASHES.slice(3);
    expect(new Set(patterned).size).toBe(patterned.length);
    for (const d of patterned) expect(d).not.toBe('');
  });

  test('seriesStyle(i) walks cat-1..7 in order and wraps', () => {
    for (let i = 0; i < 7; i++) {
      expect(seriesStyle(i)).toEqual({ color: SERIES[i], marker: MARKERS[i], dash: DASHES[i] });
    }
    expect(seriesStyle(7)).toEqual(seriesStyle(0));
    expect(seriesStyle(-1)).toEqual(seriesStyle(6));
  });
});

describe('theme.css mirror', () => {
  /** Parse the `:root { --name: value; }` block into a map. */
  async function rootTokens(): Promise<Map<string, string>> {
    const css = await Bun.file(THEME_PATH).text();
    const start = css.indexOf(':root');
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    const block = css.slice(open + 1, close);
    const out = new Map<string, string>();
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
    return out;
  }

  test('every COLORS token is in :root with the same value, byte for byte', async () => {
    const tokens = await rootTokens();
    for (const [name, value] of Object.entries(COLORS)) {
      expect(tokens.get(name)).toBe(value);
    }
  });

  test('tier tokens alias the series hues named in TIER_COLOR', async () => {
    const tokens = await rootTokens();
    const resolve = (v: string): string => {
      const m = v.match(/^var\(--([a-z0-9-]+)\)$/);
      return m ? resolve(tokens.get(m[1]) ?? '') : v;
    };
    expect(resolve(tokens.get('tier-small') ?? '')).toBe(TIER_COLOR.small);
    expect(resolve(tokens.get('tier-medium') ?? '')).toBe(TIER_COLOR.medium);
    expect(resolve(tokens.get('tier-frontier') ?? '')).toBe(TIER_COLOR.frontier);
  });

  test(':root carries exactly the §5.1 token set', async () => {
    const tokens = await rootTokens();
    const expected = [
      ...Object.keys(COLORS),
      'tier-small',
      'tier-medium',
      'tier-frontier',
      'font-ui',
      'font-data',
      'radius',
      'gap',
    ].sort();
    expect(Array.from(tokens.keys()).sort()).toEqual(expected);
  });

  test('no colour literal appears outside the :root block', async () => {
    const css = await Bun.file(THEME_PATH).text();
    const close = css.indexOf('}', css.indexOf(':root'));
    const rest = css.slice(close + 1).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rest).not.toMatch(/\b(rgba?|hsla?|color-mix)\(/);
  });
});

describe('fuzzyScore', () => {
  test('non-subsequence scores 0', () => {
    expect(fuzzyScore('hal', 'chinook · summarizer')).toBe(0);
    expect(fuzzyScore('xyz', 'overview')).toBe(0);
    expect(fuzzyScore('a', '')).toBe(0);
  });

  test('subsequence scores > 0, case-insensitively', () => {
    expect(fuzzyScore('HAL', 'halberd-monitor')).toBeGreaterThan(0);
    expect(fuzzyScore('hbm', 'halberd-monitor')).toBeGreaterThan(0);
  });

  test('empty query matches everything with the same score', () => {
    expect(fuzzyScore('', 'anything')).toBe(1);
    expect(fuzzyScore('   ', 'anything')).toBe(1);
  });

  test("'hal' → halberd-monitor beats chinook · summarizer", () => {
    expect(fuzzyScore('hal', 'halberd-monitor')).toBeGreaterThan(fuzzyScore('hal', 'chinook · summarizer'));
  });

  test('prefix beats a scattered match', () => {
    expect(fuzzyScore('sea', 'search')).toBeGreaterThan(fuzzyScore('sea', 'summarizer-east'));
    expect(fuzzyScore('fle', 'fleets')).toBeGreaterThan(fuzzyScore('fle', 'fuel · leak'));
  });

  test('a contiguous run at a word start beats a scattered prefix', () => {
    expect(fuzzyScore('mon', 'halberd-monitor')).toBeGreaterThan(fuzzyScore('mon', 'meridian · overnight'));
    expect(fuzzyScore('east', 'summarizer-east')).toBeGreaterThan(fuzzyScore('east', 'entries · all · sorted'));
  });

  test('the best alignment is found even when the first character repeats early', () => {
    expect(fuzzyScore('sum', 'east-summarizer')).toBeGreaterThan(fuzzyScore('sum', 'spend · models'));
  });

  test('ties break toward shorter text', () => {
    expect(fuzzyScore('fleet', 'fleets')).toBeGreaterThan(fuzzyScore('fleet', 'fleets · all'));
  });
});

describe('rank', () => {
  const items = [
    { id: 'overview', name: 'Overview' },
    { id: 'fleets', name: 'Fleets' },
    { id: 'halberd-monitor', name: 'halberd-monitor' },
    { id: 'chinook-summarizer', name: 'chinook · summarizer' },
    { id: 'summarizer-east', name: 'summarizer-east' },
    { id: 'routing', name: 'Models & Routing' },
  ];

  test("'hal' ranks halberd-monitor first and drops non-matches", () => {
    const r = rank('hal', items, (i) => i.name);
    expect(r[0]?.id).toBe('halberd-monitor');
    expect(r.map((i) => i.id)).not.toContain('chinook-summarizer');
  });

  test('exact prefix ranks first', () => {
    expect(rank('summ', items, (i) => i.name)[0]?.id).toBe('summarizer-east');
    expect(rank('fle', items, (i) => i.name)[0]?.id).toBe('fleets');
  });

  test('empty query returns the items in their original order, up to limit', () => {
    expect(rank('', items, (i) => i.name, 3).map((i) => i.id)).toEqual(['overview', 'fleets', 'halberd-monitor']);
    expect(rank('', items, (i) => i.name)).toHaveLength(items.length);
  });

  test('limit caps the result; a limit of 0 returns nothing', () => {
    expect(rank('e', items, (i) => i.name, 2)).toHaveLength(2);
    expect(rank('e', items, (i) => i.name, 0)).toHaveLength(0);
  });
});
