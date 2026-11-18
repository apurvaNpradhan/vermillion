import { watchPreferences, type PreferencesDatabase } from "@workspace/sync";
import type { Preferences } from "@workspace/shared";

import type { PreferencesAccess } from "./preferences-access";

/**
 * One watch of the preferences row per local database, owner and install id, shared by every
 * `usePreferences` caller: a screen that mounts reads the last value at once instead of waiting
 * for its own query. The watch runs while anything listens and the last value is kept in memory.
 * Keyed by owner and install id, so a snapshot of one account is never shown for another.
 */
export type PreferencesState = { value: Preferences | undefined; failed: boolean };

type Entry = {
  state: PreferencesState;
  listeners: Set<() => void>;
  stop: (() => void) | null;
};

const entries = new WeakMap<PreferencesDatabase, Map<string, Entry>>();
const UNKNOWN: PreferencesState = { value: undefined, failed: false };

function entryFor(database: PreferencesDatabase, access: PreferencesAccess): Entry {
  const byKey = entries.get(database) ?? new Map<string, Entry>();
  entries.set(database, byKey);
  const existing = byKey.get(access.key);
  if (existing) return existing;
  const created: Entry = { state: UNKNOWN, listeners: new Set(), stop: null };
  byKey.set(access.key, created);
  return created;
}

function publish(entry: Entry, state: PreferencesState) {
  entry.state = state;
  entry.listeners.forEach((listener) => listener());
}

export function subscribePreferences(
  database: PreferencesDatabase,
  access: PreferencesAccess,
  listener: () => void,
) {
  const entry = entryFor(database, access);
  entry.listeners.add(listener);
  entry.stop ??= watchPreferences(database, access.owner, {
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

export function preferencesSnapshot(
  database: PreferencesDatabase,
  access: PreferencesAccess,
): PreferencesState {
  return entryFor(database, access).state;
}

/** Shows a value read straight from the database, ahead of the watch's next answer. */
export function publishPreferences(
  database: PreferencesDatabase,
  access: PreferencesAccess,
  value: Preferences,
) {
  publish(entryFor(database, access), { value, failed: false });
}
