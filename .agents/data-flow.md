# Data flow

## Web

- Public routes (`_public`) render on the server in the signed-out state. The navbar's account slot fills in on the client from the session query, so pages never wait on the API.
- App (`_app`) and auth (`_auth`) routes are `ssr: false`. The guard runs in `beforeLoad` against the cached session query and redirects to `/login?redirect=<path>`. After sign-in only same-app paths are followed (`return-location`).
- Route files stay thin: metadata, search validation, guards, query warming, wiring. Page UI and logic live in the module.
- Server data is owned by TanStack Query through the oRPC client. Start server functions are not used for app data. Keep `defaultPreload: "intent"` and `defaultPreloadStaleTime: 0` so Query decides freshness.
- Include every input in query keys; invalidate with `orpc.<router>.key()`.

## Module hooks

Components read and write data only through hooks exported by their module (`use-notes`, `use-preferences`, `use-admin-users`). Hooks hold the oRPC and Query wiring and return plain values and async actions. This is the seam a local-first fork rewrites (PowerSync or Electric), so do not import `orpc` or `useQuery` in components.

```ts
// good
const { notes, create } = useNotes();
// bad: component calls orpc.notes.list.queryOptions() itself
```

## Errors and sessions

- `@workspace/client` maps oRPC errors to translated messages (`errorMessage`) and detects an expired session (`isUnauthorized`). The query client's `onError` toasts, or clears the session and sends the user to sign-in on `UNAUTHORIZED`.
- The server reports a Better Auth 401 after an authenticated check as `FORBIDDEN`, so a client never signs the user out for it.

## Native

Same module layout with Expo Router. Auth and oRPC clients come from `@workspace/client`, not copies. Native has no automated test seam; keep it thin.

## Preferences and theme

One `usePreferences` hook reads and updates `user_preferences` (locale, timezone, `ui`). Theme is per device: cookie on web, device storage on native, never the database.
