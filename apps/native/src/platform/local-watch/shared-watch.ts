/**
 * One watch per local database and key, shared by every hook that reads it: a Session screen, the
 * Resume bar and the Live notification all read the same Session, and each running its own query
 * and parse made every set write cost several times over. The watch runs while anything listens;
 * the last value stays for a while after the last listener leaves, so a screen that mounts reads
 * it at once, and is then dropped.
 */
export type SharedWatchState<T> = { value: T | undefined; failed: boolean };

type Entry<T> = {
  state: SharedWatchState<T>;
  listeners: Set<() => void>;
  stop: (() => void) | null;
  evict: ReturnType<typeof setTimeout> | null;
};

const KEEP_MS = 30_000;
const UNKNOWN = { value: undefined, failed: false };

export function createSharedWatch<Database extends object, T>(options: {
  start: (
    database: Database,
    key: string,
    onValue: (value: T) => void,
    onError: () => void,
  ) => () => void;
  /** Keeps unchanged parts of the new value as the previous objects. */
  share?: (previous: T | undefined, next: T) => T;
}) {
  const entries = new WeakMap<Database, Map<string, Entry<T>>>();

  function entryFor(database: Database, key: string): Entry<T> {
    const byKey = entries.get(database) ?? new Map<string, Entry<T>>();
    entries.set(database, byKey);
    const existing = byKey.get(key);
    if (existing) return existing;
    const created: Entry<T> = { state: UNKNOWN, listeners: new Set(), stop: null, evict: null };
    byKey.set(key, created);
    return created;
  }

  function publish(entry: Entry<T>, state: SharedWatchState<T>) {
    entry.state = state;
    entry.listeners.forEach((listener) => listener());
  }

  function run(database: Database, key: string, entry: Entry<T>) {
    entry.stop = options.start(
      database,
      key,
      (value) => {
        const shared = options.share ? options.share(entry.state.value, value) : value;
        if (entry.state.value === shared && !entry.state.failed) return;
        publish(entry, { value: shared, failed: false });
      },
      () => publish(entry, { value: entry.state.value, failed: true }),
    );
  }

  return {
    subscribe(database: Database, key: string, listener: () => void) {
      const entry = entryFor(database, key);
      if (entry.evict) clearTimeout(entry.evict);
      entry.evict = null;
      entry.listeners.add(listener);
      if (!entry.stop) run(database, key, entry);
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size > 0) return;
        entry.stop?.();
        entry.stop = null;
        entry.evict = setTimeout(() => entries.get(database)?.delete(key), KEEP_MS);
      };
    },
    snapshot(database: Database, key: string): SharedWatchState<T> {
      return entryFor(database, key).state;
    },
    /** Starts the watch again after it failed. */
    retry(database: Database, key: string) {
      const entry = entryFor(database, key);
      entry.stop?.();
      entry.stop = null;
      publish(entry, UNKNOWN);
      if (entry.listeners.size > 0) run(database, key, entry);
    },
  };
}
