# 0020. Offline cold start on web: Device owner guard plus an offline shell

Status: superseded by [0033](0033-mobile-first-api-host.md) (2026-11-09). Originally accepted 2026-11-07. Covered D7 (amended).

## Context

Today `requireSession` needs the network, so an offline gym shows sign-in. A local guard alone is not enough: if a cold navigation cannot load the app, no code runs to check the guard. The web app is TanStack Start with server-rendered public pages; the earlier spike (`~/Workspace/projects/vermillion`) was an SPA with a precached shell.

## Decision

- App route guards (web `_app`, native `(app)`) trust a local Device owner row; the server session is checked in the background ([0021](0021-device-owner-and-account-lifecycle.md)). Web calls `navigator.storage.persist()`.
- Web ships an explicit offline shell: a service worker caching the app shell, lazy route chunks, SQLite WASM and workers, so a closed app opens offline on a deep link. It never caches `/api/*`, `/rpc/*` or any auth or personalized response, and does not blindly copy the old `/index.html` fallback. Public SSR pages stay out of indiscriminate caches.
- Service worker updates must not lose queued work; a pending-write-safe update flow replaces the old update prompt.
- The supported web contract (settled 2026-11-07): `WASQLiteVFS.OPFSCoopSyncVFS` on `@powersync/web` 2.6.0 with multi-tab; the current and previous major of Chromium, Firefox and Safari, proven by Playwright on all three engines in phase 5. Without OPFS the app shows an "offline storage unavailable" screen, never a silent in-memory fallback. Revisit `vfs: 'auto'` once a release ships it (present on powersync-js HEAD, absent in 2.6.0). Behavior on storage denial, full storage and private mode is specified in phase 5.
- Verification is on a built app after closing it, not an already loaded tab.

## Implementation (phase 5)

- Document: `tanstackStart({ spa })` prerenders `/_shell`, a route-less document (root match only) at build time. The worker answers any navigation with it when the network fails or takes over 4 s; online navigations always go to the network, so server rendering and auth are untouched. TanStack Start reads the shell flag from `process.env` inside the server runtime, and the prerender runs the built Worker in workerd, so `vite/offline-shell.ts` sets `TSS_SHELL` and `CLOUDFLARE_INCLUDE_PROCESS_ENV` for the build process only. Nothing reaches the deployed Worker config.
- Worker: `apps/web/sw/sw.ts`, built by `vite/offline-shell.ts` after the client bundle. It precaches `/_shell` plus every client build file (chunks, CSS, fonts, the SQLite WASM and the PowerSync worker), except source maps and the unused encrypted and async SQLite builds, which the runtime asset rule caches on first use. Fingerprinted `/assets/*` are cache first. `/api/*`, `/rpc/*`, non-GET, cross-origin and range requests get no response from the worker.
- Updates: a new worker waits. `useOfflineUpdate` (in `platform/offline`) offers it, and after the user accepts it activates only once `trackWrite` reports no local write in flight; only that tab reloads. The previous cache generation is kept so tabs on the old build can still lazy-load chunks.
- Storage: `platform/powersync` opens `@powersync/web` on `OPFSCoopSyncVFS` after probing OPFS; failure yields an "offline storage unavailable" state (en, de), never an in-memory database. `navigator.storage.persist()` is requested on open.
- Proof: `pnpm --filter web test:e2e:offline` builds the app, installs the worker, closes the page, goes offline and reopens a deep link and its local database (Chromium).

## Consequences

- Tool choice: a small hand-written worker instead of `vite-plugin-pwa` / Workbox. The rules that matter here (never touch API or auth, one navigation fallback, user-gated activation) are about 80 lines, the policy is unit tested, and it avoids Workbox's dependency tree and its `/index.html` fallback model, which does not fit server-rendered TanStack Start.
- The shell relies on TanStack Start's shell feature and on an environment workaround for workerd; a Start upgrade can change either. The e2e test is the guard.
- A navigation that hangs for over 4 s (poor connectivity) gets the client-rendered shell instead of waiting for server rendering.
- Tabs left on an old build after an update fall back to the network for chunks missing from the kept generation.
- Open item, phase 5: Firefox and Safari runs of the offline test (only Chromium is installed on the build machine); Safari timings are unmeasured so far.
- Cold-start and multi-tab behavior can only be proven in a browser test, not headless Node ([0024](0024-test-strategy.md)).
