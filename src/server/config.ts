/** Runtime configuration. All values may be overridden by environment vars. */
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

const _port = parseInt(process.env.PORT ?? "", 10);
export const PORT = isNaN(_port) ? 5173 : _port;

export const DIST_DIR = process.env.DIST_DIR ?? "dist/client";

export const IS_PROD = process.env.NODE_ENV === "production";
