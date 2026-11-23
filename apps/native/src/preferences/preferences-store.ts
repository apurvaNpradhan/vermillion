import { watchPreferences, type PreferencesDatabase } from "@workspace/sync";
import type { Preferences } from "@workspace/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { PreferencesAccess } from "./preferences-access";

/** Undefined until the local read answers, so a screen can tell "loading" from defaults. */
type PreferencesState = { value: Preferences | undefined; failed: boolean };

const initialState: PreferencesState = { value: undefined, failed: false };
const noDatabase = createStore(() => initialState);
const entries = new WeakMap<PreferencesDatabase, Map<string, StoreApi<PreferencesState>>>();

function createWatchedStore(
  database: PreferencesDatabase,
  owner: string,
): StoreApi<PreferencesState> {
  const store = createStore(() => initialState);
  let listeners = 0;
  let stop: (() => void) | null = null;

  return {
    ...store,
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      listeners += 1;
      stop ??= watchPreferences(database, owner, {
        onValue: (value) => store.setState({ value, failed: false }, true),
        onError: () => store.setState({ value: store.getState().value, failed: true }, true),
      });
      return () => {
        unsubscribe();
        listeners -= 1;
        if (listeners === 0) {
          stop?.();
          stop = null;
        }
      };
    },
  };
}

/** Shares one watch per database and access key while any preference readers are mounted. */
export function preferencesStore(
  database: PreferencesDatabase | null,
  access: PreferencesAccess | null,
): StoreApi<PreferencesState> {
  if (!database || !access) return noDatabase;
  const byKey = entries.get(database) ?? new Map<string, StoreApi<PreferencesState>>();
  entries.set(database, byKey);
  const existing = byKey.get(access.key);
  if (existing) return existing;
  const store = createWatchedStore(database, access.owner);
  byKey.set(access.key, store);
  return store;
}

/** Shows a value read straight from the database, ahead of the watch's next answer. */
export function publishPreferences(
  database: PreferencesDatabase,
  access: PreferencesAccess,
  value: Preferences,
) {
  preferencesStore(database, access).setState({ value, failed: false }, true);
}
