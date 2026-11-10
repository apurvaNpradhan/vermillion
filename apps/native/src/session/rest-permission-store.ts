import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

import { getRestPermission, requestRestPermission, type RestPermission } from "./rest-notification";

/** "unknown" until the system has been asked how it stands. */
export type RestPermissionState = RestPermission | "unknown";

const ASKED_KEY = "session.rest-notifications-asked";

let current: RestPermissionState = "unknown";
const listeners = new Set<() => void>();
const set = (next: RestPermissionState) => {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
};

/** Reads the system's answer; call when the app opens and each time it comes to the front. */
export async function refreshRestPermission(): Promise<void> {
  set(await getRestPermission());
}

/** The user was asked, with our one-line explanation and then the system dialog, or declined to be. */
export const restPermissionAsked = () => deviceStorage.get(ASKED_KEY) === "1";
export const markRestPermissionAsked = () => deviceStorage.set(ASKED_KEY, "1");

/** Shows the system dialog (once the user agreed to our explanation) and remembers the answer. */
export async function askRestPermission(): Promise<void> {
  markRestPermissionAsked();
  set(await requestRestPermission());
}

/** The permission, shared by every screen that reads it. */
export function useRestPermission(): RestPermissionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
