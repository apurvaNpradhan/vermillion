/** Compare calendar days in the user's zone, including days shortened by DST. */
export function lastDoneLabel(start: string, now: Date, locale: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const calendarDay = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  const days = Math.round((calendarDay(new Date(start)) - calendarDay(now)) / 86400000);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
}
