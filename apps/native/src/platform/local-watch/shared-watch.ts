/** One watch per local database and key, shared while at least one subscriber is listening. */
export type SharedWatchState<T> = { value: T | undefined; failed: boolean };

type Entry<T> = {
  state: SharedWatchState<T>;
  listeners: Set<() => void>;
  stop: (() => void) | null;
};

const EMPTY = { value: undefined, failed: false };

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

  function publish(entry: Entry<T>, state: SharedWatchState<T>) {
    entry.state = state;
    const listeners = [...entry.listeners];
    for (const listener of listeners) {
      if (entry.state !== state) return;
      if (entry.listeners.has(listener)) listener();
    }
  }

  function run(database: Database, key: string, entry: Entry<T>) {
    let current = true;
    let stop: (() => void) | undefined;
    const cancel = () => {
      current = false;
      stop?.();
    };
    // Register cancellation before start, which may emit synchronously.
    entry.stop = cancel;
    stop = options.start(
      database,
      key,
      (value) => {
        if (!current) return;
        const shared = options.share ? options.share(entry.state.value, value) : value;
        if (entry.state.value === shared && !entry.state.failed) return;
        publish(entry, { value: shared, failed: false });
      },
      () => {
        if (current && !entry.state.failed) publish(entry, { value: undefined, failed: true });
      },
    );
    if (!current) stop();
  }

  return {
    subscribe(database: Database, key: string, listener: () => void) {
      const byKey = entries.get(database) ?? new Map<string, Entry<T>>();
      entries.set(database, byKey);
      const entry = byKey.get(key) ?? { state: EMPTY, listeners: new Set(), stop: null };
      byKey.set(key, entry);
      const notify = () => listener();
      entry.listeners.add(notify);
      if (!entry.stop) run(database, key, entry);
      return () => {
        if (!entry.listeners.delete(notify) || entry.listeners.size > 0) return;
        byKey.delete(key);
        entry.stop?.();
      };
    },
    snapshot(database: Database, key: string): SharedWatchState<T> {
      return entries.get(database)?.get(key)?.state ?? EMPTY;
    },
    /** Starts the watch again after it failed. */
    retry(database: Database, key: string) {
      const entry = entries.get(database)?.get(key);
      if (!entry?.state.failed) return;
      entry.stop?.();
      publish(entry, EMPTY);
      if (entry.listeners.size > 0) run(database, key, entry);
    },
  };
}
