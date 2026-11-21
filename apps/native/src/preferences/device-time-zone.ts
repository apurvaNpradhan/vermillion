import { getCalendars } from "expo-localization";

import { pickTimeZone } from "./pick-time-zone";

/** The device's time zone, read when called so a change of zone while the app runs is seen. */
export function deviceTimeZone(): string {
  return pickTimeZone(
    getCalendars()[0]?.timeZone,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}
