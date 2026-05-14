/**
 * Bun web server: static SPA + /api/* routes.
 *
 * Static files come from `dist/client/` (built by src/build.ts).
 * Unknown paths fall back to index.html (SPA-style).
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

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, url);
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(DIST_DIR, pathname);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "content-type": MIME[extname(pathname)] ?? "application/octet-stream" },
      });
    }

    // SPA fallback: serve index.html for unmatched routes.
    return new Response(Bun.file(join(DIST_DIR, "index.html")), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`spaghetti :: http://localhost:${server.port}`);
