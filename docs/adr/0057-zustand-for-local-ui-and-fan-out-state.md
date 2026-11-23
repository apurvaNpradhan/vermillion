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
  context value never changes and only selectors re-render. Module-level stores are for state
  that is truly one per app run.
- A selector returns a primitive, or an object with an equality (`shallow`). Cells and screens
  select the least they need, such as `activeKey === myKey ? text : null`.
- Keep the **tiny `useSyncExternalStore` stores** (signed-out, network, theme, permissions, crash
  reports, setup state). They have one reader shape and no fan-out problem; moving them is churn.
- For the sync snapshot use `useSyncValue(selector)`, not a store: one lifecycle already owns it.

## Consequences

- `usePreference(selector, isEqual?)` reads part of the preferences; `usePreferences()` still
  returns the whole object for code that needs all of it or the setters.
- Store logic is plain functions over `createStore`, so it is unit tested without rendering.
- Two ways to share state exist (zustand and `useSyncExternalStore`); the rule above says which.
