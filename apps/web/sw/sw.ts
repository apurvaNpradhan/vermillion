/// <reference lib="webworker" />
import { SHELL_PATH, classifyRequest, staleCaches } from "./policy";

declare const self: ServiceWorkerGlobalScope;
/** Injected at build time by `vite/offline-shell.ts`. */
declare const __PRECACHE__: string[];
declare const __BUILD_ID__: string;

const FAMILY = "shell-";
const CACHE = `${FAMILY}${__BUILD_ID__}`;
/** A navigation the network does not answer in this time is served the cached shell instead. */
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  // No skipWaiting: a new worker waits until the page asks (it may be mid-write).
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          [SHELL_PATH, ...__PRECACHE__].map((url) => new Request(url, { cache: "reload" })),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous generation: tabs still running the old build lazy-load its chunks.
      for (const name of staleCaches(await caches.keys(), FAMILY, 2)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const kind = classifyRequest(
    new URL(request.url),
    self.location.origin,
    request.method,
    request.mode,
    request.headers.has("range"),
  );
  if (kind === "navigation") event.respondWith(navigate(request));
  else if (kind === "asset") event.respondWith(asset(request));
});

/** Network first, so server rendering and auth behave as without a worker; the shell only when offline. */
async function navigate(request: Request): Promise<Response> {
  try {
    return await Promise.race([
      fetch(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("navigation timeout")), NAVIGATION_TIMEOUT_MS),
      ),
    ]);
  } catch (error) {
    const shell = await caches.match(SHELL_PATH, { ignoreVary: true });
    if (shell) return shell;
    throw error;
  }
}

/** Fingerprinted build files: cache first, fill the cache on a miss. */
async function asset(request: Request): Promise<Response> {
  // ignoreVary: the precache stores plain requests; a module script's `Origin` header must still match.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}
