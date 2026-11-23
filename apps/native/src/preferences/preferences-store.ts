import { watchPreferences, type PreferencesDatabase } from "@workspace/sync";
import type { Preferences } from "@workspace/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { PreferencesAccess } from "./preferences-access";

/**
 * One watch of the preferences row per local database, owner and install id, shared by every
 * `usePreferences` caller: a screen that mounts reads the last value at once instead of waiting
 * for its own query. The watch runs while anything listens and the last value is kept in memory.
 * Keyed by owner and install id, so a snapshot of one account is never shown for another.
 */
export type PreferencesState = { value: Preferences | undefined; failed: boolean };

type Entry = {
  store: StoreApi<PreferencesState>;
  /** Components listening through `subscribePreferences`; the watch runs while there are any. */
  listeners: number;
  stop: (() => void) | null;
};

const entries = new WeakMap<PreferencesDatabase, Map<string, Entry>>();
const UNKNOWN: PreferencesState = { value: undefined, failed: false };

function entryFor(database: PreferencesDatabase, access: PreferencesAccess): Entry {
  const byKey = entries.get(database) ?? new Map<string, Entry>();
  entries.set(database, byKey);
  const existing = byKey.get(access.key);
  if (existing) return existing;
  const created: Entry = {
    store: createStore<PreferencesState>(() => UNKNOWN),
    listeners: 0,
    stop: null,
  };
  byKey.set(access.key, created);
  return created;
}

function publish(entry: Entry, state: PreferencesState) {
  entry.store.setState(state, true);
}

export function subscribePreferences(
  database: PreferencesDatabase,
  access: PreferencesAccess,
  listener: () => void,
) {
  const entry = entryFor(database, access);
  const unsubscribe = entry.store.subscribe(listener);
  entry.listeners += 1;
  entry.stop ??= watchPreferences(database, access.owner, {
    onValue: (value) => publish(entry, { value, failed: false }),
    onError: () => publish(entry, { value: entry.store.getState().value, failed: true }),
  });
  return () => {
    unsubscribe();
    entry.listeners -= 1;
    if (entry.listeners === 0) {
      entry.stop?.();
      entry.stop = null;
    }
  };
}

export function preferencesSnapshot(
  database: PreferencesDatabase,
  access: PreferencesAccess,
): PreferencesState {
  return entryFor(database, access).store.getState();
}

/** Shows a value read straight from the database, ahead of the watch's next answer. */
export function publishPreferences(
  database: PreferencesDatabase,
  access: PreferencesAccess,
  value: Preferences,
) {
  publish(entryFor(database, access), { value, failed: false });
}

/** The last result of a memoised selector. Share one across selector instances of one reader. */
export type SelectorCache<S, T> = { state: S; select: unknown; result: T } | null;

/**
 * Wraps `select` so it returns the previous result while `isEqual` says the new one is the same:
 * a component reading a few fields as one object re-renders only when those fields change, not
 * on every publish of the whole row. `cache` outlives this wrapper, so a reader that makes a new
 * wrapper each render (an inline selector) still gets a stable result.
 */
export function memoSelector<S, T>(
  select: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  cache: { current: SelectorCache<S, T> } = { current: null },
): (state: S) => T {
  return (state) => {
    const last = cache.current;
    if (last && last.select === select && Object.is(last.state, state)) return last.result;
    const next = select(state);
    const result = last && isEqual(last.result, next) ? last.result : next;
    cache.current = { state, select, result };
    return result;
  };
}
