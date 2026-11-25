import { fromZonedParts, zonedParts, type UiPreferences } from "@workspace/shared";

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
// UTC Date arithmetic here advances calendar fields, independent of the device's current offset.
const calendarDate = (date: Date, timeZone: string) => {
  const { year, month, day } = zonedParts(date.toISOString(), timeZone);
  return new Date(Date.UTC(year, month - 1, day));
};

const dayKey = (day: Date) => day.toISOString().slice(0, 10);
const trainingReminderId = (day: Date) => `${TRAINING_REMINDER_PREFIX}${dayKey(day)}`;

function atTime(date: Date, time: string, timeZone: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return Date.parse(
    fromZonedParts(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour,
        minute,
      },
      timeZone,
    ),
  );
}

function startsInRange(sessions: readonly StartedSession[], from: number, until: number) {
  return sessions.some(({ startedAt }) => {
    const instant = Date.parse(startedAt);
    return instant >= from && instant < until;
  });
}

/** The pending training reminder to cancel once today's Session appears in local storage. */
export function startedTrainingReminderId(
  sessions: readonly StartedSession[],
  now: Date,
  timeZone: string,
): string | null {
  const today = calendarDate(now, timeZone);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  return startsInRange(
    sessions,
    atTime(today, "00:00", timeZone),
    atTime(tomorrow, "00:00", timeZone),
  )
    ? trainingReminderId(today)
    : null;
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
  timeZone,
  reminder,
  sessionsPerWeek,
  sessions,
  granted,
}: {
  now: Date;
  timeZone: string;
  reminder: UiPreferences["trainingReminder"];
  sessionsPerWeek: number | null;
  sessions: readonly StartedSession[];
  granted: boolean;
}): ReminderEntry[] {
  if (!granted || !reminder.enabled) return [];
  const weekdays = trainingWeekdays(reminder, sessionsPerWeek);
  const entries: ReminderEntry[] = [];
  const day = calendarDate(now, timeZone);
  const tomorrow = new Date(day);
  for (
    let offset = 0;
    offset < TRAINING_REMINDER_DAYS;
    offset++, day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if (!weekdays.includes(day.getUTCDay() + 1)) continue;
    const when = atTime(day, reminder.time, timeZone);
    if (when <= now.getTime()) continue;
    tomorrow.setTime(day.getTime());
    tomorrow.setUTCDate(day.getUTCDate() + 1);
    if (
      startsInRange(sessions, atTime(day, "00:00", timeZone), atTime(tomorrow, "00:00", timeZone))
    )
      continue;
    entries.push({ kind: "training", id: trainingReminderId(day), at: when, url: "/train" });
  }
  return entries;
}

/** A report is ready on the next first of the month or year if its period had a finished Session. */
export function desiredReportReminders({
  now,
  timeZone,
  reminder,
  time,
  sessions,
  granted,
}: {
  now: Date;
  timeZone: string;
  reminder: UiPreferences["reportReminder"];
  /** The training reminder's time of day, `HH:MM`. */
  time: string;
  sessions: readonly StartedSession[];
  granted: boolean;
}): ReminderEntry[] {
  if (!granted || !reminder.enabled) return [];
  const today = calendarDate(now, timeZone);
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth();
  const first = (year: number, month: number) => new Date(Date.UTC(year, month, 1));
  const thisMonth = atTime(first(year, monthIndex), time, timeZone);
  const thisYear = atTime(first(year, 0), time, timeZone);
  const nextMonthIndex = thisMonth > now.getTime() ? monthIndex : monthIndex + 1;
  const nextYear = thisYear > now.getTime() ? year : year + 1;
  const monthEnd = first(year, nextMonthIndex);
  const monthStart = first(year, nextMonthIndex - 1);
  const yearEnd = first(nextYear, 0);
  const yearStart = first(nextYear - 1, 0);
  const finished = sessions.filter((session) => session.finished);
  const hadSessions = (start: Date, end: Date) =>
    startsInRange(finished, atTime(start, "00:00", timeZone), atTime(end, "00:00", timeZone));
  const entries: ReminderEntry[] = [];
  if (hadSessions(monthStart, monthEnd)) {
    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth() + 1;
    const key = `${year}-${pad(month)}`;
    entries.push({
      kind: "report",
      id: `${REPORT_REMINDER_PREFIX}${key}`,
      at: atTime(monthEnd, time, timeZone),
      url: `/history/report/${key}`,
      period: { kind: "month", year, month },
    });
  }
  if (hadSessions(yearStart, yearEnd)) {
    const year = nextYear - 1;
    entries.push({
      kind: "report",
      id: `${REPORT_REMINDER_PREFIX}${year}`,
      at: atTime(yearEnd, time, timeZone),
      url: `/history/report/${year}`,
      period: { kind: "year", year },
    });
  }
  return entries;
}

/** The oldest Session start the reminders need, with room for any device time zone. */
export function reminderHistoryStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - 2, 11, 30));
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
