/** The calendar date (`YYYY-MM-DD`) an instant falls on in a time zone. */
export function localDateIn(zone: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}

/** A `YYYY-MM-DD` calendar date for display: it is a date, not an instant, so no zone shifts it. */
export function formatCalendarDate(
  date: string,
  locale: string,
  dateStyle: "medium" | "long" = "medium",
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
