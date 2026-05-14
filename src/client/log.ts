/**
 * Client-side fire-and-forget event logger.
 *
 * Each `logEvent(...)` call posts a JSON envelope to /api/log; the server
 * appends it to a per-session JSONL file under ~/.spaghetti/
 * game-chat-histories/. Calls never throw or block — logging failures are
 * silently swallowed so a server-side hiccup can't break the game.
 *
 * The session ID is generated on first call and held in memory for the
 * lifetime of the page load. Reloading the tab starts a new session
 * (new ID, new file).
 *
 * `keepalive: true` on the fetch lets the last few events survive a tab
 * close (browsers cap keepalive bodies at 64KB total per origin, which
 * is plenty for our event sizes).
 */

let cachedSessionId: string | null = null;

export function sessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    cachedSessionId = crypto.randomUUID();
  } else {
    // Fallback if crypto.randomUUID isn't available (old browsers, SSR).
    cachedSessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return cachedSessionId;
}

/**
 * Forget the cached session ID. Used by the soft-restart flow so the
 * next logEvent() call generates a new ID — equivalent to what a
 * real browser reload would do.
 */
export function resetSessionId(): void {
  cachedSessionId = null;
}

export function logEvent(event: Record<string, unknown>): void {
  if (typeof fetch === "undefined") return;
  const sid = sessionId();
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sid, event }),
      keepalive: true,
    }).catch(() => {
      /* swallow — logging must not break the game */
    });
  } catch {
    /* swallow */
  }
}
