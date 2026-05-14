/** Runtime configuration. All values may be overridden by environment vars. */
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export const PORT = Number(process.env.PORT ?? 5173);

export const DIST_DIR = process.env.DIST_DIR ?? "dist/client";

export const IS_PROD = process.env.NODE_ENV === "production";
