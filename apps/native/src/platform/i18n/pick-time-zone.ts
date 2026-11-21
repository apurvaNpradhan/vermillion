import { isTimeZone } from "@workspace/shared";

/**
 * The time zone the app uses: the device's. The calendar zone the phone reports comes first, then
 * the JavaScript engine's, then UTC. A zone saved on the account never overrides it (the setting
 * was removed; the stored column is kept for old data).
 */
export function pickTimeZone(calendarZone: string | null | undefined, engineZone: string): string {
  const calendar = calendarZone?.trim();
  if (calendar && isTimeZone(calendar)) return calendar;
  const engine = engineZone.trim();
  return engine && isTimeZone(engine) ? engine : "UTC";
}
