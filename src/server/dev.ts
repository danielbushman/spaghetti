/**
 * Dev entrypoint: build the SPA, start the server, and rebuild on file changes.
 *
 * Run:  bun run src/server/dev.ts
 *
 * No HMR yet — refresh the browser after a "[dev] rebuilt" log line. Adding a
 * tiny SSE-based auto-reload later is straightforward; deliberately deferred
 * so the first commit stays minimal.
 */
import { watch } from "node:fs";
import { buildClient } from "../build";

let pending: ReturnType<typeof setTimeout> | null = null;
let building = false;

async function rebuild(): Promise<void> {
  if (building) return;
  building = true;
  try {
    await buildClient();
    console.log("[dev] rebuilt");
  } catch (e) {
    console.error("[dev] build failed:", e);
  } finally {
    building = false;
  }
}

await buildClient();
await import("./index");

watch("src/client", { recursive: true }, () => {
  if (pending) clearTimeout(pending);
  pending = setTimeout(rebuild, 60);
});

console.log("[dev] watching src/client");
