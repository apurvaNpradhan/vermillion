# Data flow

## Native

Expo Router. Route files in `apps/native/app` stay thin: guards, wiring, layout. Screens and logic live in the module under `apps/native/src/<vertical>`.

- Server data is owned by TanStack Query through the oRPC client; synced data (the exercise library) comes from the local SQLite database through the module hook ([sync](sync.md)).
- Auth and oRPC clients come from `@workspace/client`, not copies. Include every input in query keys; invalidate with `orpc.<router>.key()`.
- Native has no automated UI test seam; keep screens thin and put logic in tested sibling files.

## Module hooks

Components read and write data only through hooks exported by their module (`use-exercise-library`, `use-preferences`). Hooks hold the oRPC, Query and local-database wiring and return plain values and async actions. Do not import `orpc` or `useQuery` in components.

```ts
// good
const { page, loadMore } = useExerciseLibrary(filters);
// bad: component queries the local database or calls orpc.preferences.get.queryOptions() itself
```

## Local UI state

Per-screen and editor UI state, and shared state many components read in slices, live in zustand stores read through selectors; stores are scoped to their provider when the state is per instance. PowerSync watches stay the source of truth for synced data: a store may be fed by one, never replace it. See [ADR 0057](../docs/adr/0057-zustand-for-local-ui-and-fan-out-state.md). `usePreference(selector)` reads part of the preferences; `useSyncValue(selector)` part of the sync state.

## Errors and sessions

- `@workspace/client` maps oRPC errors to translated messages (`errorMessage`) and detects an expired session (`isUnauthorized`). The query client's `onError` toasts, or clears the session and sends the user to sign-in on `UNAUTHORIZED`.
- The server reports a Better Auth 401 after an authenticated check as `FORBIDDEN`, so a client never signs the user out for it.

## Preferences and theme

One `usePreferences` hook reads and updates the account locale and `ui` settings. Its `timeZone` follows the device calendar. The `user_preferences.timezone` column remains for compatibility with older clients. Theme is per device, in device storage, never the database.

## Tab stacks

Every stack tab in `app/(app)` declares its first screen with `unstable_settings.initialRouteName`. When the active tab changes, the tab navigator resets the stack that lost focus. Tapping the current tab also pops it to the top. A push to another tab's nested route passes `ANCHORED` (`@/platform/navigation/anchored`) to seed an unmounted stack with its first screen. Back from a tab root follows tab history. Opening a root modal such as the Session screen or the import's exercise picker keeps the underlying tab stack.
