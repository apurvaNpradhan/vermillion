import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

const KEY = "auth.signed-out";
const listeners = new Set<() => void>();
let signedOut = deviceStorage.get(KEY) === "1";

/**
 * Whether the user chose to sign out on this device (ADR 0021, amended). The device keeps its
 * data either way; this only decides where the app opens: an explicit sign-out shows the welcome
 * screen, while a session that merely expired keeps the app open on the local data.
 */
export function setSignedOut(value: boolean) {
  if (value === signedOut) return;
  signedOut = value;
  deviceStorage.set(KEY, value ? "1" : null);
  for (const listener of listeners) listener();
}

export function useSignedOut(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => signedOut,
  );
}
