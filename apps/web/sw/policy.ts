/**
 * Which requests the offline service worker may touch and which build files it precaches
 * (ADR 0020). Pure functions, shared by the worker, the build plugin and the unit tests.
 */

/** Never cached, never answered by the worker: API, RPC and everything auth. */
const NEVER_HANDLED_PREFIXES = ["/api/", "/rpc/"];

/** The prerendered document with no matched routes; the offline answer to any navigation. */
export const SHELL_PATH = "/_shell";

/** The worker script itself must always come from the network. */
export const WORKER_PATH = "/sw.js";

export type RequestKind = "ignore" | "navigation" | "asset";

/**
 * Classify a request. `ignore` means the worker does not respond at all, so the browser behaves
 * exactly as it would without a worker. Only same-origin GETs are ever handled.
 */
export function classifyRequest(
  url: URL,
  origin: string,
  method: string,
  mode: string,
  hasRange: boolean,
): RequestKind {
  if (method !== "GET" || url.origin !== origin || hasRange) return "ignore";
  if (url.pathname === WORKER_PATH) return "ignore";
  if (NEVER_HANDLED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return "ignore";
  if (mode === "navigate") return "navigation";
  // Vite fingerprints everything under /assets/, so a cached copy is never stale.
  if (url.pathname.startsWith("/assets/")) return "asset";
  return "ignore";
}

/**
 * Build files worth installing up front. Source maps are never needed. The encrypted (`mc-`)
 * SQLite builds are unused on web (no encryption key, ADR 0015) and the async build only backs the
 * IndexedDB VFS; both are still cached on first use by the runtime asset rule.
 */
export function isPrecacheable(file: string): boolean {
  if (file.endsWith(".map")) return false;
  const name = file.split("/").pop() ?? file;
  // Dotfiles (`.assetsignore`) configure the deploy and are not served.
  if (name.startsWith(".")) return false;
  if (name.endsWith(".wasm") && (name.startsWith("mc-") || name.includes("-async-"))) return false;
  return true;
}

/** Keep the newest `keep` caches of this worker's family (browsers list caches in creation order). */
export function staleCaches(names: string[], family: string, keep: number): string[] {
  const own = names.filter((name) => name.startsWith(family));
  return own.slice(0, Math.max(0, own.length - keep));
}
