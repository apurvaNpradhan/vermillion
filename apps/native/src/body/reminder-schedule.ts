import type { UiPreferences } from "@workspace/shared";

export const BODY_REMINDER_PREFIX = "body-reminder:";
export type ReminderKind = "weight" | "check-in";
export type ReminderSchedule = {
  id: string;
  kind: ReminderKind;
  time: string;
  weekday?: number;
  date?: number;
};

/** Weekdays use Expo's convention: Sunday = 1. Date setters follow device time and DST. */
export function nextReminderFire(now: number, time: string, weekday?: number): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (weekday !== undefined) next.setDate(next.getDate() + ((weekday - 1 - next.getDay() + 7) % 7));
  if (next.getTime() <= now) {
    next.setDate(next.getDate() + (weekday === undefined ? 1 : 7));
    next.setHours(hour, minute, 0, 0);
  }
  return next.getTime();
}

export function desiredBodyReminders({
  ui,
  now,
  loggedToday,
  granted,
}: {
  ui: Pick<UiPreferences, "weighInReminder" | "checkInReminder">;
  now: number;
  loggedToday: boolean;
  granted: boolean;
}): ReminderSchedule[] {
  if (!granted) return [];
  const desired: ReminderSchedule[] = [];
  const weight = ui.weighInReminder;
  const today = new Date(now).getDay() + 1;
  const todayFire = nextReminderFire(now, weight.time);
  if (weight.enabled) {
    if (loggedToday && new Date(todayFire).toDateString() === new Date(now).toDateString()) {
      // Expo cannot give a repeating trigger a delayed start. Keep the other six weekdays
      // repeating, and cover this weekday with dated requests until the next app reconciliation.
      // 48 requests + six repeats + Check-in leaves room below iOS's 64-request limit.
      for (let weekday = 1; weekday <= 7; weekday++) {
        if (weekday !== today)
          desired.push({
            id: `${BODY_REMINDER_PREFIX}weight:${weekday}`,
            kind: "weight",
            time: weight.time,
            weekday,
          });
      }
      const next = new Date(todayFire);
      const [hour = 0, minute = 0] = weight.time.split(":").map(Number);
      for (let week = 1; week <= 48; week++) {
        next.setDate(next.getDate() + 7);
        next.setHours(hour, minute, 0, 0);
        desired.push({
          id: `${BODY_REMINDER_PREFIX}weight:skip:${week}`,
          kind: "weight",
          time: weight.time,
          date: next.getTime(),
        });
      }
    } else desired.push({ id: `${BODY_REMINDER_PREFIX}weight`, kind: "weight", time: weight.time });
  }
  if (ui.checkInReminder.enabled)
    desired.push({
      id: `${BODY_REMINDER_PREFIX}check-in`,
      kind: "check-in",
      time: ui.checkInReminder.time,
      weekday: ui.checkInReminder.weekday,
    });
  return desired;
}

/** Only owned requests are touched; signatures include translated content and the device zone. */
export function planBodyReminders(
  desired: readonly ReminderSchedule[],
  scheduled: readonly { id: string; signature: string }[],
  context: string,
) {
  const signature = (entry: ReminderSchedule) => JSON.stringify([entry, context]);
  const wanted = new Map(desired.map((entry) => [entry.id, signature(entry)]));
  const held = new Map(scheduled.map((entry) => [entry.id, entry.signature]));
  return {
    cancel: scheduled.flatMap((entry) =>
      entry.id.startsWith(BODY_REMINDER_PREFIX) && wanted.get(entry.id) !== entry.signature
        ? [entry.id]
        : [],
    ),
    schedule: desired.flatMap((entry) =>
      held.get(entry.id) === signature(entry) ? [] : [{ ...entry, signature: signature(entry) }],
    ),
  };
}
