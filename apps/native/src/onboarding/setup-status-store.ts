type SetupStatus = "pending" | "done";

type SetupStorage = {
  get(key: string): string | null;
  set(key: string, value: SetupStatus): void;
};

const keyFor = (userId: string) => `onboarding.setup.${userId}`;

/** Keep the route guard current even when device storage cannot persist a write. */
export function createSetupStatusStore(storage: SetupStorage) {
  const current = new Map<string, SetupStatus>();
  const listeners = new Set<() => void>();

  return {
    needsSetup(userId: string): boolean {
      return userId !== "" && (current.get(userId) ?? storage.get(keyFor(userId))) !== "done";
    },
    set(userId: string, status: SetupStatus) {
      current.set(userId, status);
      storage.set(keyFor(userId), status);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
