export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/** The hour (0-23) of an instant in a time zone; the device's zone when `timeZone` is null. */
function hourIn(iso: string, timeZone: string | null): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timeZone ?? undefined,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * Which part of the day a Session started in, by the user's local hour: morning 5-11, afternoon
 * 12-16, evening 17-20, otherwise night.
 */
export function timeOfDay(iso: string, timeZone: string | null): TimeOfDay {
  const hour = hourIn(iso, timeZone);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
