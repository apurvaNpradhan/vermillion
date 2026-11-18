import { watchPreferences, type PreferencesDatabase } from "@workspace/sync";
import type { Preferences } from "@workspace/shared";

/**
 * One watch of the preferences row per local database, shared by every `usePreferences` caller:
 * a screen that mounts reads the last value at once instead of waiting for its own query. The
 * watch runs while anything listens and the last value is kept in memory.
 */
export type PreferencesState = { value: Preferences | undefined; failed: boolean };

type Entry = {
  state: PreferencesState;
  listeners: Set<() => void>;
  stop: (() => void) | null;
};

const entries = new WeakMap<PreferencesDatabase, Entry>();
const UNKNOWN: PreferencesState = { value: undefined, failed: false };

function entryFor(database: PreferencesDatabase): Entry {
  const existing = entries.get(database);
  if (existing) return existing;
  const created: Entry = { state: UNKNOWN, listeners: new Set(), stop: null };
  entries.set(database, created);
  return created;
}

function publish(entry: Entry, state: PreferencesState) {
  entry.state = state;
  entry.listeners.forEach((listener) => listener());
}

export function subscribePreferences(database: PreferencesDatabase, listener: () => void) {
  const entry = entryFor(database);
  entry.listeners.add(listener);
  entry.stop ??= watchPreferences(database, {
    onValue: (value) => publish(entry, { value, failed: false }),
    onError: () => publish(entry, { value: entry.state.value, failed: true }),
  });
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.stop?.();
      entry.stop = null;
    }
  };
}

export function preferencesSnapshot(database: PreferencesDatabase): PreferencesState {
  return entryFor(database).state;
}
