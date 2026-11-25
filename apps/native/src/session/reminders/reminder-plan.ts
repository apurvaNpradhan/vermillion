import type { UiPreferences } from "@workspace/shared";

export const TRAINING_REMINDER_PREFIX = "training-reminder:";
export const REPORT_REMINDER_PREFIX = "report-reminder:";
/** How many days ahead training reminders are scheduled (well inside iOS's 64 pending requests). */
export const TRAINING_REMINDER_DAYS = 14;

/** A Session as the reminders see it: when it started and whether it was finished. */
export type StartedSession = { startedAt: string; finished: boolean };

export type ReminderEntry =
  | { kind: "training"; id: string; at: number; url: "/train" }
  | {
      kind: "report";
      id: string;
      at: number;
      url: string;
      period: { kind: "month"; year: number; month: number } | { kind: "year"; year: number };
    };

/** Expo weekdays: Sunday is 1. Days to train by sessions per week, Monday first. */
const SETUP_WEEKDAYS = {
  1: [2],
  2: [2, 5],
  3: [2, 4, 6],
  4: [2, 3, 5, 6],
  5: [2, 3, 4, 5, 6],
  6: [2, 3, 4, 5, 6, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
} as const satisfies { [sessionsPerWeek: number]: readonly number[] };

/** The days a training reminder starts on: from the setup answer, else Monday, Wednesday, Friday. */
export function defaultTrainingWeekdays(sessionsPerWeek: number | null): number[] {
  const known = Object.entries(SETUP_WEEKDAYS).find(([key]) => Number(key) === sessionsPerWeek);
  return [...(known?.[1] ?? SETUP_WEEKDAYS[3])];
}

/** The reminder's chosen days, or the setup default while none was chosen; sorted, no repeats. */
export function trainingWeekdays(
  reminder: Pick<UiPreferences["trainingReminder"], "weekdays">,
  sessionsPerWeek: number | null,
): number[] {
  const days = reminder.weekdays ?? defaultTrainingWeekdays(sessionsPerWeek);
  return [...new Set(days)].sort((a, b) => a - b);
}

const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function atTime(date: Date, time: string): Date {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
}

/** True when a Session (finished or not) started on the same local calendar day as `day`. */
export function startedOnDay(sessions: readonly StartedSession[], day: Date): boolean {
  const key = dayKey(day);
  return sessions.some((session) => dayKey(new Date(session.startedAt)) === key);
}

/**
 * One dated notification per chosen weekday in the next {@link TRAINING_REMINDER_DAYS} days, at
 * the reminder time (the phone's wall clock). A day whose time has passed, and a day on which a
 * Session already started, get none: a repeating request could not skip them, so these are dated
 * and the schedule is made again when the app opens, a Session starts or finishes, or the Run
 * changes.
 */
export function desiredTrainingReminders({
  now,
  reminder,
  sessionsPerWeek,
  sessions,
  granted,
}: {
  now: Date;
  reminder: UiPreferences["trainingReminder"];
  sessionsPerWeek: number | null;
  sessions: readonly StartedSession[];
  granted: boolean;
}): ReminderEntry[] {
  if (!granted || !reminder.enabled) return [];
  const weekdays = trainingWeekdays(reminder, sessionsPerWeek);
  const entries: ReminderEntry[] = [];
  for (let offset = 0; offset < TRAINING_REMINDER_DAYS; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const when = atTime(day, reminder.time);
    if (when.getTime() <= now.getTime()) continue;
    if (!weekdays.includes(day.getDay() + 1)) continue;
    if (startedOnDay(sessions, day)) continue;
    entries.push({
      kind: "training",
      id: `${TRAINING_REMINDER_PREFIX}${dayKey(day)}`,
      at: when.getTime(),
      url: "/train",
    });
  }
  return entries;
}

/** True when a finished Session started in the local calendar month (`month` is 1 to 12) or year. */
export function periodHadSessions(
  sessions: readonly StartedSession[],
  period: { year: number; month?: number },
): boolean {
  return sessions.some((session) => {
    if (!session.finished) return false;
    const started = new Date(session.startedAt);
    return (
      started.getFullYear() === period.year &&
      (period.month === undefined || started.getMonth() + 1 === period.month)
    );
  });
}

/**
 * The next 1st of a month at the reminder time: last month's report, and on 1 January also the
 * year's. A report with no finished Session in its period is left out, so the notification is only
 * scheduled once the period has one (the schedule is made again whenever a Session finishes).
 */
export function desiredReportReminders({
  now,
  reminder,
  time,
  sessions,
  granted,
}: {
  now: Date;
  reminder: UiPreferences["reportReminder"];
  /** The training reminder's time of day, `HH:MM`. */
  time: string;
  sessions: readonly StartedSession[];
  granted: boolean;
}): ReminderEntry[] {
  if (!granted || !reminder.enabled) return [];
  const thisMonth = atTime(new Date(now.getFullYear(), now.getMonth(), 1), time);
  const target =
    thisMonth.getTime() > now.getTime()
      ? thisMonth
      : atTime(new Date(now.getFullYear(), now.getMonth() + 1, 1), time);
  const previous = new Date(target.getFullYear(), target.getMonth() - 1, 1);
  const year = previous.getFullYear();
  const month = previous.getMonth() + 1;
  const entries: ReminderEntry[] = [];
  if (periodHadSessions(sessions, { year, month })) {
    const key = `${year}-${pad(month)}`;
    entries.push({
      kind: "report",
      id: `${REPORT_REMINDER_PREFIX}${key}`,
      at: target.getTime(),
      url: `/history/report/${key}`,
      period: { kind: "month", year, month },
    });
  }
  if (month === 12 && periodHadSessions(sessions, { year })) {
    entries.push({
      kind: "report",
      id: `${REPORT_REMINDER_PREFIX}${year}`,
      at: target.getTime(),
      url: `/history/report/${year}`,
      period: { kind: "year", year },
    });
  }
  return entries;
}

/** The oldest Session start the reminders need: the start of the previous year. */
export function reminderHistoryStart(now: Date): Date {
  return new Date(now.getFullYear() - 1, 0, 1);
}

export type HeldReminder = { id: string; signature: string };

/** Whether an identifier belongs to the training or report reminders. */
export const ownsReminder = (id: string) =>
  id.startsWith(TRAINING_REMINDER_PREFIX) || id.startsWith(REPORT_REMINDER_PREFIX);

/** What identifies an entry and its text: a changed time, day or wording replaces the request. */
export const reminderSignature = (entry: ReminderEntry, content: { title: string; body: string }) =>
  JSON.stringify([entry.at, entry.url, content.title, content.body]);

/**
 * Cancels this module's requests that are no longer wanted or changed, schedules the missing ones.
 * Other requests (rest, body reminders) are never touched.
 */
export function planReminders(
  desired: readonly (ReminderEntry & { signature: string })[],
  held: readonly HeldReminder[],
) {
  const wanted = new Map(desired.map((entry) => [entry.id, entry.signature]));
  const cancel = held.flatMap((entry) =>
    ownsReminder(entry.id) && wanted.get(entry.id) !== entry.signature ? [entry.id] : [],
  );
  const heldSame = new Set(
    held.flatMap((entry) => (wanted.get(entry.id) === entry.signature ? [entry.id] : [])),
  );
  return { cancel, schedule: desired.filter((entry) => !heldSame.has(entry.id)) };
}
