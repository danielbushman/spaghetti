/**
 * Console build smoke test (plan §6, §7 T9).
 *
 *   bun test tests/console/smoke.test.ts
 *
 * Builds the real console entry in-process into a tmp dir and checks the
 * outputs the page depends on: a bundle of real size, a stylesheet that
 * carries the tokens, an html that links it, no external resources, and
 * not one `[svelte]` warning from any component or rune module. This is
 * the only compile check the `.svelte` files get (bun test cannot import
 * them), so a warning here is a failure, not noise.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConsole } from '../../src/build';

const ENTRY = 'src/console/main.ts';
const HTML = 'src/console/index.html';
/** A bundle smaller than this did not include the rooms. */
const MIN_JS_BYTES = 10 * 1024;

let tmp = '';
let warnings: string[] = [];
let buildError: unknown = null;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'spaghetti-console-'));
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await buildConsole(tmp, ENTRY, HTML);
  } catch (err) {
    buildError = err;
  } finally {
    console.warn = original;
  }
}, 120_000);

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe('buildConsole of the real entry', () => {
  test('succeeds in-process', () => {
    expect(buildError).toBeNull();
    expect(existsSync(join(tmp, 'console.js'))).toBe(true);
  });

  test('console.js is a real bundle (> 10 KB)', async () => {
    const size = Bun.file(join(tmp, 'console.js')).size;
    expect(size).toBeGreaterThan(MIN_JS_BYTES);
  });

  test('console.css exists and carries the tokens', async () => {
    const path = join(tmp, 'console.css');
    expect(existsSync(path)).toBe(true);
    const css = await Bun.file(path).text();
    expect(css).toContain('--accent');
    expect(css).toContain('--money');
  });

  test('the emitted index.html links /console.css before /console.js', async () => {
    const html = await Bun.file(join(tmp, 'index.html')).text();
    expect(html).toContain('href="/console.css"');
    expect(html).toContain('src="/console.js"');
    expect(html.indexOf('/console.css')).toBeLessThan(html.indexOf('/console.js'));
  });

  test('no external resources: no fonts.googleapis anywhere in the outputs', async () => {
    const html = await Bun.file(join(tmp, 'index.html')).text();
    const css = await Bun.file(join(tmp, 'console.css')).text();
    const js = await Bun.file(join(tmp, 'console.js')).text();
    for (const text of [html, css, js]) {
      expect(text).not.toContain('fonts.googleapis');
      expect(text).not.toContain('fonts.gstatic');
    }
  });

  test('zero [svelte] warnings from every component and rune module', () => {
    const svelte = warnings.filter((w) => w.includes('[svelte]'));
    expect(svelte).toEqual([]);
  });
});
