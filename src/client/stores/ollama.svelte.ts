/**
 * Ollama model list + last error. Populated by `/api/models`.
 */
export type ModelInfo = { name: string; size?: number };

class OllamaStore {
  models = $state<ModelInfo[]>([]);
  error = $state<string | null>(null);

  async refresh(): Promise<void> {
    this.error = null;
    try {
      const r = await fetch("/api/models");
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
      this.error = e instanceof Error ? e.message : String(e);
      this.models = [];
    }
  }
}

export const ollama = new OllamaStore();
