/**
 * Build the client SPA into `dist/client/`.
 *
 * Run directly:   bun run src/build.ts
 * Importable via: import { buildClient } from './build';
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { sveltePlugin } from "./svelte-plugin";

export async function buildClient(outdir = "dist/client"): Promise<void> {
  if (!existsSync(outdir)) await mkdir(outdir, { recursive: true });

  const result = await Bun.build({
    entrypoints: ["src/client/main.ts"],
    outdir,
    target: "browser",
    format: "esm",
    plugins: [sveltePlugin()],
    splitting: false,
    sourcemap: process.env.NODE_ENV === "production" ? "none" : "inline",
    minify: process.env.NODE_ENV === "production",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("client build failed");
  }

  // index.html is hand-written; copy it next to the JS bundle.
  await Bun.write(`${outdir}/index.html`, await Bun.file("src/client/index.html").text());
}

if (import.meta.main) {
  await buildClient();
  console.log("[build] complete");
}
