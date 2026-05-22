/**
 * Chat history persistence — server side.
 *
 * Each browser session gets a single .chat-history.jsonl file under
 * ~/.spaghetti/game-chat-histories/ (override with $SPAGHETTI_LOG_DIR).
 * Events are appended one per line: session_start, user_message,
 * agent_message, system_message, scene_phase, pick_status, etc. The file
 * is always up-to-date — each event append flushes before the request
 * returns.
 *
 * Sessions are identified by a client-generated session ID (UUID).
 * The first time the server sees a session ID, it creates a file named
 * with a wall-clock timestamp of first-contact:
 *
 *   YYYY-MM-DD_HH-MM-SS.chat-history.jsonl
 *
 * Subsequent events for the same session append to the same file. If two
 * sessions arrive within the same second, the second gets a `-1`, `-2`...
 * suffix.
 *
 * Concurrent first-write protection: the session→path map stores a
 * Promise so two simultaneous first-writes for one session resolve to
 * the same path.
 */
import { access, appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_ROOT = join(homedir(), ".spaghetti", "game-chat-histories");
const ROOT = process.env.SPAGHETTI_LOG_DIR ?? DEFAULT_ROOT;
const DISABLED = process.env.SPAGHETTI_LOG_DISABLED === "1";

const sessionPaths = new Map<string, Promise<string>>();

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** YYYY-MM-DD_HH-MM-SS in local time. Filename-safe. */
export function formatStamp(d: Date): string {
  return (
    d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + "_" +
    pad(d.getHours()) + "-" +
    pad(d.getMinutes()) + "-" +
    pad(d.getSeconds())
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function filePathFor(sessionId: string): Promise<string> {
  let p = sessionPaths.get(sessionId);
  if (p) return p;
  p = (async () => {
    await mkdir(ROOT, { recursive: true });
    const stamp = formatStamp(new Date());
    let path = join(ROOT, `${stamp}.chat-history.jsonl`);
    let i = 1;
    while (await fileExists(path)) {
      path = join(ROOT, `${stamp}-${i}.chat-history.jsonl`);
      i++;
    }
    return path;
  })();
  sessionPaths.set(sessionId, p);
  return p;
}

export async function appendChatLog(
  sessionId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (DISABLED) return;
  const path = await filePathFor(sessionId);
  const line = JSON.stringify({ t: new Date().toISOString(), ...event });
  await appendFile(path, line + "\n");
}

export function getLogRoot(): string {
  return ROOT;
}
