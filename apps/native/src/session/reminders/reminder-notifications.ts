import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { z } from "zod";

import { ownsReminder, type HeldReminder, type ReminderEntry } from "./reminder-plan";

export const REMINDER_CHANNEL = "training-reminders";

export async function installReminderChannel(name: string) {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
}

/** The training and report requests the system holds, with the signature they were made with. */
export async function heldReminders(): Promise<HeldReminder[]> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.flatMap((request) => {
    if (!ownsReminder(request.identifier)) return [];
    const parsed = z.object({ signature: z.string() }).safeParse(request.content.data);
    return [{ id: request.identifier, signature: parsed.success ? parsed.data.signature : "" }];
  });
}

export async function cancelReminder(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function scheduleReminder(
  entry: ReminderEntry & { signature: string },
  content: { title: string; body: string },
) {
  await Notifications.scheduleNotificationAsync({
    identifier: entry.id,
    content: { ...content, sound: true, data: { signature: entry.signature, url: entry.url } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: entry.at,
      channelId: REMINDER_CHANNEL,
    },
  });
}
