/**
 * /api/* routes for the spaghetti web client.
 *
 *   GET  /api/models        → { models: [{ name, size? }] }
 *   POST /api/chat          → application/x-ndjson stream proxied from Ollama
 *
 * Ollama's /api/chat streams NDJSON (one JSON object per line). We pass that
 * stream straight through. The client parses lines, pulls `message.content`,
 * stops on `done: true`.
 */
import { OLLAMA_BASE_URL } from "./config";

export async function handleApi(req: Request, url: URL): Promise<Response> {
  if (url.pathname === "/api/models" && req.method === "GET") return listModels();
  if (url.pathname === "/api/chat" && req.method === "POST") return chatStream(req);
  return json({ error: "not found" }, 404);
}

async function listModels(): Promise<Response> {
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!r.ok) {
      return json(
        { error: `ollama returned ${r.status}`, models: [] },
        502,
      );
    }
    const data = (await r.json()) as {
      models?: Array<{ name: string; size?: number }>;
    };
    return json({ models: data.models ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(
      { error: `could not reach Ollama at ${OLLAMA_BASE_URL}: ${msg}`, models: [] },
      502,
    );
  }
}

async function chatStream(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(body as Record<string, unknown>), stream: true }),
    });
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => "");
      return json({ error: `ollama returned ${r.status}: ${text}` }, 502);
    }
    return new Response(r.body, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `chat failed: ${msg}` }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
