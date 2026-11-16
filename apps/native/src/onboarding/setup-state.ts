import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

/**
 * Whether an account is still in the setup steps that follow the name (units, body, reminders).
 * The mark is written on this device the moment a new account saves its name and removed after
 * the last step, so the app stays closed until setup is finished, also after the app is killed
 * mid-way. An account that never got the mark (every account from before these steps, and one
 * that signs in on a second device) is not asked.
 */
const keyFor = (userId: string) => `onboarding.setup.${userId}`;
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

export function isSetupPending(userId: string): boolean {
  return userId !== "" && deviceStorage.get(keyFor(userId)) === "pending";
}

export function beginSetup(userId: string) {
  deviceStorage.set(keyFor(userId), "pending");
  changed();
}

export function finishSetup(userId: string) {
  deviceStorage.set(keyFor(userId), "done");
  changed();
}

export function useSetupPending(userId: string): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return isSetupPending(userId);
}
