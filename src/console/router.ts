/**
 * Hash routes between rooms. Plan §4.3 (T5). Pure: no DOM, no state.
 *
 * `#/overview` (default) · `#/fleets` · `#/fleets/:id` · `#/routing?tier=`
 * `#/spend?group=&range=&top=&fleet=`. The query is passed through verbatim,
 * never whitelisted, so a room can add a key and it round-trips. `href()` is
 * the only place in the console where a hash is built; `src/sim` never
 * emits one.
 */

export type Room = 'overview' | 'fleets' | 'fleet' | 'routing' | 'spend';

export interface Route {
  room: Room;
  /** Fleet id for the `fleet` room; absent otherwise. */
  id?: string;
  query: Record<string, string>;
}

/** What `href()` accepts: `query` may be omitted. */
export type RouteInput = { room: Room; id?: string; query?: Record<string, string> };

/** Rail entries and their `g x` chords. Fleet detail has no rail entry. */
export const ROOMS: readonly { room: Room; label: string; hotkey: string }[] = [
  { room: 'overview', label: 'Overview', hotkey: 'g o' },
  { room: 'fleets', label: 'Fleets', hotkey: 'g f' },
  { room: 'routing', label: 'Models & Routing', hotkey: 'g r' },
  { room: 'spend', label: 'Spend Explorer', hotkey: 'g s' },
];

/** Spend Explorer defaults (§4.3): group `fleet`, range `7d`, top `10`, no fleet filter. */
export const SPEND_DEFAULTS = { group: 'fleet', range: '7d', top: '10', fleet: '' } as const;

export const DEFAULT_ROUTE: Route = { room: 'overview', query: {} };

/** The path segment for each room; `fleet` shares `fleets`' segment. */
const SEGMENT: Record<Room, string> = {
  overview: 'overview',
  fleets: 'fleets',
  fleet: 'fleets',
  routing: 'routing',
  spend: 'spend',
};

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Parse `?a=1&b=2` (with or without the `?`) into a plain record; later keys win. */
export function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = search.startsWith('?') ? search.slice(1) : search;
  if (body === '') return out;
  for (const pair of body.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const key = decode(eq < 0 ? pair : pair.slice(0, eq));
    const value = eq < 0 ? '' : decode(pair.slice(eq + 1));
    if (key !== '') out[key] = value;
  }
  return out;
}

/** Encode a record as `a=1&b=2` in insertion order; empty record → ''. */
export function encodeQuery(query: Record<string, string> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const key of Object.keys(query)) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`);
  }
  return parts.join('&');
}

/**
 * Parse a location hash. Accepts `#/x`, `/x`, `x`, `#x`; empty, `#`, `#/`
 * and unknown rooms fall back to the Overview (with an empty query, so a
 * stray hash never carries state into the wrong room).
 */
export function parseRoute(hash: string): Route {
  let s = hash ?? '';
  if (s.startsWith('#')) s = s.slice(1);
  const q = s.indexOf('?');
  const search = q >= 0 ? s.slice(q + 1) : '';
  let path = q >= 0 ? s.slice(0, q) : s;
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = path === '' ? [] : path.split('/').map(decode);
  const head = segments[0] ?? 'overview';
  const query = parseQuery(search);

  switch (head) {
    case 'overview':
      return { room: 'overview', query };
    case 'fleets':
    case 'fleet': {
      const id = segments[1];
      return id ? { room: 'fleet', id, query } : { room: 'fleets', query };
    }
    case 'routing':
      return { room: 'routing', query };
    case 'spend':
      return { room: 'spend', query };
    default:
      return { room: 'overview', query: {} };
  }
}

/** Build the hash for a route: `#/fleets/summarizer-east`, `#/spend?group=model&range=7d`. */
export function href(route: RouteInput): string {
  let path = `#/${SEGMENT[route.room]}`;
  if (route.room === 'fleet' && route.id) path += `/${encodeURIComponent(route.id)}`;
  const qs = encodeQuery(route.query);
  return qs === '' ? path : `${path}?${qs}`;
}

/** Spend Explorer params with defaults applied (§4.3); `top` falls back when not a positive integer. */
export function spendParams(query: Record<string, string>): { group: string; range: string; top: number; fleet: string } {
  const top = Number.parseInt(query.top ?? '', 10);
  return {
    group: query.group || SPEND_DEFAULTS.group,
    range: query.range || SPEND_DEFAULTS.range,
    top: Number.isInteger(top) && top > 0 ? top : Number.parseInt(SPEND_DEFAULTS.top, 10),
    fleet: query.fleet || SPEND_DEFAULTS.fleet,
  };
}

/** True when two routes point at the same place (same room, id and query). */
export function sameRoute(a: RouteInput, b: RouteInput): boolean {
  return href(a) === href(b);
}
