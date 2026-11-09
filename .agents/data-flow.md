# Data flow

## Native

Expo Router. Route files in `apps/native/app` stay thin: guards, wiring, layout. Screens and logic live in the module under `apps/native/src/<vertical>`.

- Server data is owned by TanStack Query through the oRPC client; synced data (notes) comes from the local SQLite database through the module hook ([sync](sync.md)).
- Auth and oRPC clients come from `@workspace/client`, not copies. Include every input in query keys; invalidate with `orpc.<router>.key()`.
- Native has no automated UI test seam; keep screens thin and put logic in tested sibling files.

## Module hooks

Components read and write data only through hooks exported by their module (`use-notes`, `use-preferences`). Hooks hold the oRPC, Query and local-database wiring and return plain values and async actions. Do not import `orpc` or `useQuery` in components.

```ts
// good
const { notes, create } = useNotes();
// bad: component calls orpc.notes.list.queryOptions() itself
```

## Errors and sessions

- `@workspace/client` maps oRPC errors to translated messages (`errorMessage`) and detects an expired session (`isUnauthorized`). The query client's `onError` toasts, or clears the session and sends the user to sign-in on `UNAUTHORIZED`.
- The server reports a Better Auth 401 after an authenticated check as `FORBIDDEN`, so a client never signs the user out for it.

## Preferences and theme

One `usePreferences` hook reads and updates `user_preferences` (locale, timezone, `ui`). Theme is per device, in device storage, never the database.
