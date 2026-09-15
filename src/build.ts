/**
 * Build the two browser entries into `dist/client/`.
 *
 *   /            the console (src/console) — console.js + console.css + index.html
 *   /cockpit/    the pre-pivot cockpit (src/client) — main.js + cockpit/index.html
 *
 * Run directly:   bun run src/build.ts
 * Importable via: import { buildAll, buildClient, buildConsole } from './build';
 *
 * The console entry may not exist yet (it lands in a later wave). `buildConsole`
 * skips with a log line in that case so `bun run dev` works in every wave.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { sveltePlugin } from "./svelte-plugin";

const prod = (): boolean => process.env.NODE_ENV === "production";

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

/** Copy a hand-written html file to its destination, creating parent dirs. */
async function copyHtml(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  await ensureDir(dirname(dest));
  await Bun.write(dest, await Bun.file(src).text());
}

/**
 * The pre-pivot cockpit. Bundle is byte-for-byte the previous behaviour; only
 * the html now lands under `cockpit/`. Its `/main.js` reference still resolves
 * because the bundle stays at the outdir root.
 */
export async function buildClient(outdir = "dist/client"): Promise<void> {
  await ensureDir(outdir);

  const result = await Bun.build({
    entrypoints: ["src/client/main.ts"],
    outdir,
    target: "browser",
    format: "esm",
    plugins: [sveltePlugin()],
    splitting: false, // single-page app — one bundle, no async chunks needed
    sourcemap: prod() ? "none" : "inline",
    minify: prod(),
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("client build failed");
  }

  await copyHtml("src/client/index.html", `${outdir}/cockpit/index.html`);
}

/**
 * The console. Bun does not inline a `.css` import into the JS bundle: the CSS
 * reachable from the entry is emitted as a sibling output under the `entry`
 * naming, so `console.[ext]` yields `console.js` and `console.css`. The
 * console's index.html links `/console.css` explicitly (T5).
 */
export async function buildConsole(
  outdir = "dist/client",
  entry = "src/console/main.ts",
  html = "src/console/index.html",
): Promise<void> {
  if (!existsSync(entry)) {
    console.log("[build] console entry missing, skipping");
    return;
  }
  await ensureDir(outdir);

  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: "browser",
    format: "esm",
    plugins: [sveltePlugin()],
    splitting: false,
    naming: {
      entry: "console.[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    sourcemap: prod() ? "none" : "inline",
    minify: prod(),
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("console build failed");
  }

  await copyHtml(html, `${outdir}/index.html`);
}

/** Cockpit first, then console. */
export async function buildAll(outdir = "dist/client"): Promise<void> {
  await buildClient(outdir);
  await buildConsole(outdir);
}

if (import.meta.main) {
  await buildAll();
  console.log("[build] complete");
}
