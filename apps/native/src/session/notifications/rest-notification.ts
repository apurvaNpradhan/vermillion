import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { REST_NOTIFICATION_PREFIX, restNotificationId } from "@/session/rest/rest-schedule";

import {
  REST_CHANNEL_SILENT,
  REST_CHANNEL_WITH_SOUND,
  REST_SOUND_FILE,
  RETIRED_REST_CHANNELS,
  restChannelId,
  restNotificationSound,
  shouldChimeInForeground,
} from "@/session/settings/rest-sound";

/** True while the logging screen is in front: it shows the Rest itself and buzzes, so no banner. */
let surfaceVisible = false;
/** Resolves once the Android channel exists, so a notification never lands on the default one. */
let channelReady: Promise<void> = Promise.resolve();
/** The "Rest timer sound" setting, kept here for the notification handler and the scheduler. */
let soundOn = true;
export function setRestSurfaceVisible(visible: boolean) {
  surfaceVisible = visible;
}
export function isRestSurfaceVisible(): boolean {
  return surfaceVisible;
}
export function setRestSoundEnabled(enabled: boolean) {
  soundOn = enabled;
}

/**
 * Sets up Rest notifications once: how one that arrives while the app is open is shown, and the
 * Android channels (high importance, vibrating; one with the chime and one silent, because a
 * channel's sound cannot change once created: ADR 0038). `channelName` is the translated "Rest
 * timer".
 */
export function installRestNotifications(channelName: string): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      if (notification.request.identifier.startsWith("body-reminder:"))
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      return {
        shouldShowBanner: !surfaceVisible,
        shouldShowList: !surfaceVisible,
        shouldPlaySound: shouldChimeInForeground({ soundOn, surfaceVisible }),
        shouldSetBadge: false,
      };
    },
  });
  if (Platform.OS !== "android") return Promise.resolve();
  const channel = (id: string, sound: string | null) =>
    Notifications.setNotificationChannelAsync(id, {
      name: channelName,
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 250, 200, 250],
      sound,
      // Notification usage, so the ringer mode and Do Not Disturb silence the chime.
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  channelReady = Promise.all([
    channel(REST_CHANNEL_WITH_SOUND, REST_SOUND_FILE),
    channel(REST_CHANNEL_SILENT, null),
    ...RETIRED_REST_CHANNELS.map((id) => Notifications.deleteNotificationChannelAsync(id)),
  ]).then(
    () => undefined,
    // Without the channel the notification still arrives, on the default one.
    () => undefined,
  );
  return channelReady;
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
      content: {
        title: content.title,
        body: content.body,
        sound: restNotificationSound(soundOn),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endsAt,
        channelId: restChannelId(soundOn),
      },
    });
  } catch {
    // A failed schedule only loses the background buzz; the bar and haptics still work.
  }
}
