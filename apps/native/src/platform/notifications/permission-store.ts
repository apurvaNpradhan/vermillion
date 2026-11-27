import { useSyncExternalStore } from "react";

import { deviceStorage } from "@/platform/storage";

import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from "./permission";

/** "unknown" until the system has been asked how it stands. */
export type NotificationPermissionState = NotificationPermission | "unknown";

// The key predates the move out of `session`; renaming it would ask everyone again.
const ASKED_KEY = "session.rest-notifications-asked";

let current: NotificationPermissionState = "unknown";
const listeners = new Set<() => void>();
const set = (next: NotificationPermissionState) => {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
};

/** Reads the system's answer; call when the app opens and each time it comes to the front. */
export async function refreshNotificationPermission(): Promise<void> {
  set(await getNotificationPermission());
}

/** The user was asked, with our one-line explanation and then the system dialog, or declined to be. */
export const notificationPermissionAsked = () => deviceStorage.get(ASKED_KEY) === "1";
export const markNotificationPermissionAsked = () => deviceStorage.set(ASKED_KEY, "1");

/** Shows the system dialog (once the user agreed to our explanation) and remembers the answer. */
export async function askNotificationPermission(): Promise<NotificationPermission> {
  markNotificationPermissionAsked();
  const permission = await requestNotificationPermission();
  set(permission);
  return permission;
}

/** The permission, shared by every screen that reads it. */
export function useNotificationPermission(): NotificationPermissionState {
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
