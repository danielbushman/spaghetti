/**
 * Hash router contract (plan §4.3, §6 T5).
 *
 *   bun test tests/console/router.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ROUTE,
  ROOMS,
  SPEND_DEFAULTS,
  encodeQuery,
  href,
  parseQuery,
  parseRoute,
  sameRoute,
  spendParams,
  type Route,
} from '../../src/console/router';

describe('parseRoute', () => {
  test('the empty hash and its variants are the Overview', () => {
    for (const h of ['', '#', '#/', '/', '#/overview', 'overview', '#overview']) {
      expect(parseRoute(h)).toEqual({ room: 'overview', query: {} });
    }
    expect(DEFAULT_ROUTE).toEqual({ room: 'overview', query: {} });
  });

  test('every room parses', () => {
    expect(parseRoute('#/fleets')).toEqual({ room: 'fleets', query: {} });
    expect(parseRoute('#/fleets/summarizer-east')).toEqual({ room: 'fleet', id: 'summarizer-east', query: {} });
    expect(parseRoute('#/routing')).toEqual({ room: 'routing', query: {} });
    expect(parseRoute('#/routing?tier=frontier')).toEqual({ room: 'routing', query: { tier: 'frontier' } });
    expect(parseRoute('#/spend')).toEqual({ room: 'spend', query: {} });
  });

  test('the spend query is passed through verbatim, fleet= included', () => {
    expect(parseRoute('#/spend?group=model&range=7d&fleet=summarizer-east')).toEqual({
      room: 'spend',
      query: { group: 'model', range: '7d', fleet: 'summarizer-east' },
    });
    const full = parseRoute('#/spend?group=model&range=7d&top=10&fleet=summarizer-east');
    expect(full.query).toEqual({ group: 'model', range: '7d', top: '10', fleet: 'summarizer-east' });
    // Not whitelisted: an unknown key round-trips too.
    expect(parseRoute('#/spend?zoom=3').query).toEqual({ zoom: '3' });
  });

  test('an unknown room falls back to the Overview with an empty query', () => {
    expect(parseRoute('#/nope?x=1')).toEqual({ room: 'overview', query: {} });
  });

  test('trailing slashes and encoded ids are tolerated', () => {
    expect(parseRoute('#/fleets/')).toEqual({ room: 'fleets', query: {} });
    expect(parseRoute('#/fleets/a%20b')).toEqual({ room: 'fleet', id: 'a b', query: {} });
  });
});

describe('href', () => {
  test('builds each route', () => {
    expect(href({ room: 'overview' })).toBe('#/overview');
    expect(href({ room: 'fleets' })).toBe('#/fleets');
    expect(href({ room: 'fleet', id: 'summarizer-east' })).toBe('#/fleets/summarizer-east');
    expect(href({ room: 'routing', query: { tier: 'small' } })).toBe('#/routing?tier=small');
    expect(href({ room: 'spend', query: { group: 'model', range: '7d' } })).toBe('#/spend?group=model&range=7d');
    expect(href({ room: 'spend', query: {} })).toBe('#/spend');
  });

  test('round-trips every route, fleet= and top= included', () => {
    const routes: Route[] = [
      { room: 'overview', query: {} },
      { room: 'fleets', query: {} },
      { room: 'fleet', id: 'summarizer-east', query: {} },
      { room: 'fleet', id: 'halberd-monitor', query: { tab: 'policy' } },
      { room: 'routing', query: {} },
      { room: 'routing', query: { tier: 'frontier' } },
      { room: 'spend', query: {} },
      { room: 'spend', query: { group: 'model', range: '7d', top: '10', fleet: 'summarizer-east' } },
      { room: 'spend', query: { group: 'workload', fleet: 'summarizer-east' } },
      { room: 'spend', query: { range: 'run', top: '5' } },
    ];
    for (const r of routes) {
      expect(parseRoute(href(r))).toEqual(r);
      expect(sameRoute(parseRoute(href(r)), r)).toBe(true);
    }
  });

  test('encodes ids and query values', () => {
    const r: Route = { room: 'fleet', id: 'a b/c', query: { note: 'x&y=z' } };
    expect(parseRoute(href(r))).toEqual(r);
  });
});

describe('query helpers', () => {
  test('parseQuery / encodeQuery', () => {
    expect(parseQuery('?a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseQuery('a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseQuery('')).toEqual({});
    expect(parseQuery('flag')).toEqual({ flag: '' });
    expect(parseQuery('a=1&a=2')).toEqual({ a: '2' });
    expect(encodeQuery({ a: '1', b: 'x y' })).toBe('a=1&b=x%20y');
    expect(encodeQuery(undefined)).toBe('');
    expect(encodeQuery({})).toBe('');
  });

  test('spendParams applies the §4.3 defaults', () => {
    expect(SPEND_DEFAULTS).toEqual({ group: 'fleet', range: '7d', top: '10', fleet: '' });
    expect(spendParams({})).toEqual({ group: 'fleet', range: '7d', top: 10, fleet: '' });
    expect(spendParams({ group: 'model', top: '3', fleet: 'summarizer-east' })).toEqual({
      group: 'model',
      range: '7d',
      top: 3,
      fleet: 'summarizer-east',
    });
    expect(spendParams({ top: 'x' }).top).toBe(10);
    expect(spendParams({ top: '0' }).top).toBe(10);
  });
});

describe('ROOMS', () => {
  test('the four rail entries and their chords', () => {
    expect(ROOMS.map((r) => r.room)).toEqual(['overview', 'fleets', 'routing', 'spend']);
    expect(ROOMS.map((r) => r.hotkey)).toEqual(['g o', 'g f', 'g r', 'g s']);
    expect(ROOMS.map((r) => r.label)).toEqual(['Overview', 'Fleets', 'Models & Routing', 'Spend Explorer']);
  });
});
