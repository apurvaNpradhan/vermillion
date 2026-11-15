import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { z } from "zod";
import { BODY_REMINDER_PREFIX, type ReminderSchedule } from "./reminder-schedule";

export const BODY_CHANNEL = "body-reminders";
export async function installBodyChannel(name: string) {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(BODY_CHANNEL, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
}
export async function scheduledBodyReminders() {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.flatMap((request) => {
    if (!request.identifier.startsWith(BODY_REMINDER_PREFIX)) return [];
    const parsed = z.object({ signature: z.string() }).safeParse(request.content.data);
    return [{ id: request.identifier, signature: parsed.success ? parsed.data.signature : "" }];
  });
}
export async function cancelBodyReminder(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}
export async function scheduleBodyReminder(
  entry: ReminderSchedule & { signature: string },
  content: { title: string; body: string },
) {
  const [hour = 0, minute = 0] = entry.time.split(":").map(Number);
  await Notifications.scheduleNotificationAsync({
    identifier: entry.id,
    content: {
      ...content,
      sound: "default",
      data: {
        signature: entry.signature,
        url: entry.kind === "weight" ? "/body/weight?reminder=1" : "/body/measurements?reminder=1",
      },
    },
    trigger:
      entry.weekday !== undefined
        ? {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: entry.weekday,
            hour,
            minute,
            channelId: BODY_CHANNEL,
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: BODY_CHANNEL,
          },
  });
}
