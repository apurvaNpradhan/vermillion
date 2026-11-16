import * as Notifications from "expo-notifications";

export type NotificationPermission = "granted" | "denied" | "undetermined";

/**
 * Android 13 and later report a permission never asked for as denied, with `canAskAgain`; that is
 * undetermined here, so the app still asks. Only a denial the system will not ask again reads as
 * denied.
 */
function permissionOf(response: { status: string; canAskAgain: boolean }): NotificationPermission {
  if (response.status === Notifications.PermissionStatus.GRANTED) return "granted";
  if (response.status === Notifications.PermissionStatus.DENIED && !response.canAskAgain) {
    return "denied";
  }
  return "undetermined";
}

/** Whether the app may post notifications; failures read as "undetermined". */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  try {
    return permissionOf(await Notifications.getPermissionsAsync());
  } catch {
    return "undetermined";
  }
}

/** Shows the system permission dialog. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  try {
    return permissionOf(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      }),
    );
  } catch {
    return "undetermined";
  }
}
