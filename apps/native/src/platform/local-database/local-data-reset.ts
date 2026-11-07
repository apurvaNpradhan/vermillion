import type { LocalDataReset } from "./key-lifecycle";

type Listener = () => void;

/**
 * Holds the "local data reset" event until the UI has shown it. The reset happens while the
 * database opens, usually before any component is mounted, so the event waits here.
 */
export function createLocalDataResetStore() {
  let current: LocalDataReset | null = null;
  const listeners = new Set<Listener>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    report(event: LocalDataReset) {
      current = event;
      notify();
    },
    dismiss() {
      if (current === null) return;
      current = null;
      notify();
    },
    get(): LocalDataReset | null {
      return current;
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const localDataReset = createLocalDataResetStore();
