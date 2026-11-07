# 0020. Offline cold start on web: Device owner guard plus an offline shell

Status: accepted (2026-11-07). Covers D7 (amended).

## Context

Today `requireSession` needs the network, so an offline gym shows sign-in. A local guard alone is not enough: if a cold navigation cannot load the app, no code runs to check the guard. The web app is TanStack Start with server-rendered public pages; the earlier spike (`~/Workspace/projects/vermillion`) was an SPA with a precached shell.

## Decision

- App route guards (web `_app`, native `(app)`) trust a local Device owner row; the server session is checked in the background ([0021](0021-device-owner-and-account-lifecycle.md)). Web calls `navigator.storage.persist()`.
- Web ships an explicit offline shell: a service worker caching the app shell, lazy route chunks, SQLite WASM and workers, so a closed app opens offline on a deep link. It never caches `/api/*`, `/rpc/*` or any auth or personalized response, and does not blindly copy the old `/index.html` fallback. Public SSR pages stay out of indiscriminate caches.
- Service worker updates must not lose queued work; a pending-write-safe update flow replaces the old update prompt.
- The supported web contract (settled 2026-11-07): `WASQLiteVFS.OPFSCoopSyncVFS` on `@powersync/web` 2.6.0 with multi-tab; the current and previous major of Chromium, Firefox and Safari, proven by Playwright on all three engines in phase 5. Without OPFS the app shows an "offline storage unavailable" screen, never a silent in-memory fallback. Revisit `vfs: 'auto'` once a release ships it (present on powersync-js HEAD, absent in 2.6.0). Behavior on storage denial, full storage and private mode is specified in phase 5.
- Verification is on a built app after closing it, not an already loaded tab.

## Consequences

- Open item, phase 5: Safari timings are unmeasured so far.
- Open item, phase 5: how the offline shell integrates with TanStack Start and the Cloudflare Worker.
- Cold-start and multi-tab behavior can only be proven in a browser test, not headless Node ([0024](0024-test-strategy.md)).
