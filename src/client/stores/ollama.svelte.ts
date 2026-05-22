/**
 * Ollama model list + last error. Populated by `/api/models`.
 *
 * The list returned by Ollama includes embedding-only models (BERT family,
 * names containing "embed", etc.) — those don't support /api/chat and would
 * break the awakening scene if auto-selected. `chatModels` filters them out.
 */
export type ModelInfo = {
  name: string;
  size?: number;
  details?: {
    family?: string;
    families?: string[];
  };
};

/**
 * Heuristic: a model is chat-capable unless its name contains "embed" or
 * its declared family/families looks like an embedding model (BERT or any
 * variant whose name contains "embed").
 *
 * Catches the typical Ollama tags we've seen — qwen3-embedding,
 * mxbai-embed-large, nomic-embed-text — without needing a hand-maintained
 * deny-list. Ollama doesn't expose a "capabilities" field on /api/tags;
 * if it ever does, swap this for that.
 */
function isChatCapable(m: ModelInfo): boolean {
  if (/embed/i.test(m.name)) return false;
  const family = m.details?.family;
  if (family === "bert" || (family && /embed/i.test(family))) return false;
  const families = m.details?.families ?? [];
  if (families.some((f) => f === "bert" || /embed/i.test(f))) return false;
  return true;
}

class OllamaStore {
  models = $state<ModelInfo[]>([]);
  error = $state<string | null>(null);

  private _refreshController: AbortController | null = null;

  /** Models that can serve /api/chat — embeddings filtered out. */
  get chatModels(): ModelInfo[] {
    return this.models.filter(isChatCapable);
  }

  async refresh(): Promise<void> {
    this._refreshController?.abort();
    const controller = new AbortController();
    this._refreshController = controller;
    this.error = null;
    try {
      const r = await fetch("/api/models", {
        signal: AbortSignal.any
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
          : controller.signal,
      });
      if (controller.signal.aborted) return;
      const data = (await r.json().catch(() => ({}))) as {
        models?: ModelInfo[];
        error?: string;
      };
      if (!r.ok || data.error) {
        this.error = data.error ?? `status ${r.status}`;
        this.models = [];
        return;
      }
      this.models = data.models ?? [];
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      this.error = e instanceof Error ? e.message : String(e);
      this.models = [];
    }
  }
}

export const ollama = new OllamaStore();
