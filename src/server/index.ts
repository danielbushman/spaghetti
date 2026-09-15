/**
 * Bun web server: static files + /api/* routes.
 *
 * Static files come from `dist/client/` (built by src/build.ts):
 *   /            the console            (dist/client/index.html)
 *   /cockpit/    the pre-pivot cockpit  (dist/client/cockpit/index.html)
 *
 * A path with no extension (or one that does not exist) is tried as a
 * directory first — `${path}/index.html` — so `/cockpit` and `/cockpit/` both
 * serve the cockpit. Anything still unmatched falls back to the console's
 * index.html (SPA-style). Before the console entry exists, that fallback is
 * the cockpit html, since `buildConsole` skipped.
 */
import { join, extname } from "node:path";
import { handleApi } from "./api";
import { DIST_DIR, PORT } from "./config";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map":  "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

const HTML = { "content-type": "text/html; charset=utf-8" };

/** The first of the candidate files that exists on disk, or null. */
async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const path of candidates) {
    if (await Bun.file(path).exists()) return path;
  }
  return null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, url);
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(DIST_DIR, pathname);
    const ext = extname(pathname);

    // Directory → index.html resolution comes first for extension-less paths;
    // a plain file is only served when it has an extension and exists.
    if (ext === "" || !(await Bun.file(filePath).exists())) {
      const dirIndex = join(filePath, "index.html");
      if (await Bun.file(dirIndex).exists()) {
        return new Response(Bun.file(dirIndex), { headers: HTML });
      }
    } else {
      return new Response(Bun.file(filePath), {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
      });
    }

    // SPA fallback: the console html, or the cockpit's until the console is built.
    const fallback = await firstExisting([
      join(DIST_DIR, "index.html"),
      join(DIST_DIR, "cockpit", "index.html"),
    ]);
    if (fallback === null) {
      return new Response("nothing built yet — run `bun run build`", { status: 503 });
    }
    return new Response(Bun.file(fallback), { headers: HTML });
  },
});

console.log(`spaghetti :: http://localhost:${server.port}`);
