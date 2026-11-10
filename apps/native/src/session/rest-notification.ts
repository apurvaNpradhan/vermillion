import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { REST_NOTIFICATION_PREFIX, restNotificationId } from "./rest-schedule";

/** The Android channel of the Rest notification. */
const CHANNEL_ID = "rest-timer";

export type RestPermission = "granted" | "denied" | "undetermined";

/** True while the logging screen is in front: it shows the Rest itself and buzzes, so no banner. */
let surfaceVisible = false;
/** Resolves once the Android channel exists, so a notification never lands on the default one. */
let channelReady: Promise<void> = Promise.resolve();
export function setRestSurfaceVisible(visible: boolean) {
  surfaceVisible = visible;
}

/**
 * Sets up Rest notifications once: how one that arrives while the app is open is shown, and the
 * Android channel (high importance, vibrating, no sound: ADR 0038 has haptics and no sounds).
 * `channelName` is the translated "Rest timer".
 */
export function installRestNotifications(channelName: string): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: !surfaceVisible,
      shouldShowList: !surfaceVisible,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: channelName,
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 250, 200, 250],
    sound: null,
  }).then(
    () => undefined,
    // Without the channel the notification still arrives, on the default one.
    () => undefined,
  );
  return channelReady;
}

/**
 * Android 13 and later report a permission never asked for as denied, with `canAskAgain`; that is
 * undetermined here, so the app still asks. Only a denial the system will not ask again reads as
 * denied.
 */
function permissionOf(response: { status: string; canAskAgain: boolean }): RestPermission {
  if (response.status === Notifications.PermissionStatus.GRANTED) return "granted";
  if (response.status === Notifications.PermissionStatus.DENIED && !response.canAskAgain) {
    return "denied";
  }
  return "undetermined";
}

/** Whether the app may post notifications; failures read as "undetermined". */
export async function getRestPermission(): Promise<RestPermission> {
  try {
    return permissionOf(await Notifications.getPermissionsAsync());
  } catch {
    return "undetermined";
  }
}

/** Shows the system permission dialog. */
export async function requestRestPermission(): Promise<RestPermission> {
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

/** The ids of the Rest notifications the system holds. */
export async function scheduledRestIds(): Promise<string[]> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all
      .map((request) => request.identifier)
      .filter((id) => id.startsWith(REST_NOTIFICATION_PREFIX));
  } catch {
    return [];
  }
}

export async function cancelRestNotification(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already gone.
  }
}

/**
 * Schedules the notification for a Session's Rest at `endsAt`, replacing any earlier one for that
 * Session, so a stale notification never fires.
 */
export async function scheduleRestNotification(
  sessionId: string,
  endsAt: number,
  content: { title: string; body: string },
): Promise<void> {
  const identifier = restNotificationId(sessionId);
  await channelReady;
  await cancelRestNotification(identifier);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: content.title, body: content.body, sound: false },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endsAt,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // A failed schedule only loses the background buzz; the bar and haptics still work.
  }
}
