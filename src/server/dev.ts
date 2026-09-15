/**
 * Dev entrypoint: build both entries, start the server, rebuild on file changes.
 *
 * Run:  bun run src/server/dev.ts
 *
 * Watches src/client (cockpit), src/console and src/sim (console). The console
 * directories may not exist yet in early waves; a missing one is reported and
 * skipped, and `buildAll` skips the console entry the same way, so this works
 * in every wave.
 *
 * No HMR yet — refresh the browser after a "[dev] rebuilt" log line. Adding a
 * tiny SSE-based auto-reload later is straightforward; deliberately deferred
 * so the first commit stays minimal.
 */
import { existsSync, watch } from "node:fs";
import { buildAll } from "../build";

const WATCHED = ["src/client", "src/console", "src/sim"];

let pending: ReturnType<typeof setTimeout> | null = null;
let building = false;

async function rebuild(): Promise<void> {
  if (building) return;
  building = true;
  try {
    await buildAll();
    console.log("[dev] rebuilt");
  } catch (e) {
    console.error("[dev] build failed:", e);
  } finally {
    building = false;
  }
}

// One debounce shared by every watcher: a change anywhere rebuilds everything.
function scheduleRebuild(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(rebuild, 60);
}

await buildAll();
await import("./index");

for (const dir of WATCHED) {
  if (!existsSync(dir)) {
    console.log(`[dev] ${dir} not present yet; not watched`);
    continue;
  }
  watch(dir, { recursive: true }, scheduleRebuild);
}

console.log(`[dev] watching ${WATCHED.join(", ")}`);
