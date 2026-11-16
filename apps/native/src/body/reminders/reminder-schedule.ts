import type { UiPreferences } from "@workspace/shared";

export const BODY_REMINDER_PREFIX = "body-reminder:";
export type ReminderKind = "weight" | "check-in";
export type ReminderSchedule = {
  id: string;
  kind: ReminderKind;
  time: string;
  weekday?: number;
};

/**
 * One repeating request per enabled reminder: a daily weigh-in and a weekly Check-in (Expo
 * weekdays, Sunday = 1). Reminder times are wall-clock times wherever the phone is, so the OS
 * keeps them at the chosen hour across DST and travel. A reminder always fires, even after a
 * weigh-in that day: a repeating request cannot skip one day, and dated workarounds either
 * expire or exhaust iOS's 64 pending requests (ADR 0041).
 */
export function desiredBodyReminders({
  ui,
  granted,
}: {
  ui: Pick<UiPreferences, "weighInReminder" | "checkInReminder">;
  granted: boolean;
}): ReminderSchedule[] {
  if (!granted) return [];
  const desired: ReminderSchedule[] = [];
  if (ui.weighInReminder.enabled)
    desired.push({
      id: `${BODY_REMINDER_PREFIX}weight`,
      kind: "weight",
      time: ui.weighInReminder.time,
    });
  if (ui.checkInReminder.enabled)
    desired.push({
      id: `${BODY_REMINDER_PREFIX}check-in`,
      kind: "check-in",
      time: ui.checkInReminder.time,
      weekday: ui.checkInReminder.weekday,
    });
  return desired;
}

/** Only owned requests are touched; signatures include the translated content. */
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
