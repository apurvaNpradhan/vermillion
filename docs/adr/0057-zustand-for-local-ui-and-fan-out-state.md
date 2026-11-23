# 0057. zustand for local UI and fan-out state

Status: accepted, 2026-11-23.

## Context

React context carries a value, and every consumer re-renders when the value changes. The Workout
editor's keypad context held the typed text, so each keystroke re-rendered every set cell and
table. `usePreferences()` handed every caller the whole preferences row, and the tab action
context re-rendered screens that only set the action or hid the bar. `useSyncStatus()` returned
the whole sync snapshot, which changes several times on every write. The cost is real on the
session and editor screens, and selectors fix it where context cannot.

## Decision

- Use **zustand** (vanilla stores, read with `useStore(store, selector)`) for per-screen and
  editor UI state, and to fan shared state out to many readers who each need a slice.
- **PowerSync watches stay the source of truth for synced data.** A store may be fed by a watch
  (the preferences store is), but it never replaces the watch or holds data the database owns.
- **Scope a store to its provider when the state is per instance.** The provider creates it with
  `createStore` (`useState(createX)`) and the context holds the store, not its value, so the
  context value stays stable and only changed selections trigger store-driven renders.
  Module-level stores are for state shared across the app.
- A selector returns a primitive or an existing reference. Use an equality function such as
  `shallow` with `usePreference` when picking several fields into a new object. Cells select the
  text of the active cell or null. The edited table can still render when an accepted key changes
  its saved draft. Its unchanged cell buttons skip that render.
- Keep the **tiny `useSyncExternalStore` stores** (signed-out, network, theme, permissions, crash
  reports, setup state). They have one reader shape and no fan-out problem; moving them is churn.
- For the sync snapshot use `useSyncValue(selector)`, not a store: one lifecycle already owns it.

## Consequences

- `usePreference(selector, isEqual?)` reads part of the preferences; `usePreferences()` still
  returns the whole object for code that needs all of it or the setters.
- The keypad and tab action stores are unit tested without rendering.
- Two ways to share state exist (zustand and `useSyncExternalStore`); the rule above says which.
