import { getT } from "@workspace/i18n";

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
  // Hermes does not provide RelativeTimeFormat. Keep relative labels in our locale resources.
  const t = getT(locale);
  if (days === 0) return t("workout__today");
  if (days === -1) return t("workout__yesterday");
  if (days === 1) return t("workout__tomorrow");
  return days < 0
    ? t("workout__days_ago", { count: -days })
    : t("workout__days_ahead", { count: days });
}
