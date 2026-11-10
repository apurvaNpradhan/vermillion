import type { FinishedSession } from "@workspace/sync";

/** Monday's calendar date in the user's zone, independent of DST day length. */
export function isoWeekKey(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (kind: string) => Number(parts.find((item) => item.type === kind)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function groupSessionWeeks(sessions: readonly FinishedSession[], timezone: string) {
  const weeks = new Map<string, FinishedSession[]>();
  for (const session of [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    const key = isoWeekKey(session.started_at, timezone);
    const group = weeks.get(key) ?? [];
    group.push(session);
    weeks.set(key, group);
  }
  return [...weeks].map(([week, sessions]) => ({ week, sessions }));
}
