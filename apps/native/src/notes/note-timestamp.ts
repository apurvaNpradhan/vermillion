/**
 * When a note was last changed, as short as it can be: the time for today, the day and month
 * this year, the full date before that. Uses the active locale's formats.
 */
export function noteTimestamp(iso: string, now: Date, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
