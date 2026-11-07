# 0012. Public pages render on the server; the app is a client-only SPA

Status: accepted (2026-11-06).

## Context

Public pages should load fast and be indexable and cacheable, while the signed-in area should feel like a single-page app.

## Decision

TanStack Start. Public routes render on the server in the signed-out state; the session-dependent navbar slot fills in on the client, so pages never block on the API. App and auth routes are `ssr: false`, with an auth guard in `beforeLoad` against a cached session query. The post-sign-in redirect accepts only paths inside the app. The Worker's bundle contains only public `VITE_*` build-time values.

## Consequences

- Cacheable public HTML; a brief signed-out flash for signed-in visitors on public pages.
- Secrets can never reach the Worker or the browser.
