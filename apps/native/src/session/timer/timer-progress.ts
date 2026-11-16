/** How the Timer draws "sets done of all": a square each, a thin segment each, or one bar. */
export type ProgressStyle = "squares" | "segments" | "bar";

/** Squares up to 16 sets, thin segments up to 60, and a plain bar beyond that. */
export function progressStyle(total: number): ProgressStyle {
  if (total <= 16) return "squares";
  return total <= 60 ? "segments" : "bar";
}

/** "03": at least two digits, for the "03 / 12" counter. */
export function padCount(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(2, "0");
}

/** The clock time of `ms` as "14:02:05", in the locale and time zone given (the device's when null). */
export function clockTime(ms: number, locale: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(ms));
}
