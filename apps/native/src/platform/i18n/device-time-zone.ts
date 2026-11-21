import { getCalendars, useCalendars } from "expo-localization";
import { useMemo } from "react";

import { pickTimeZone } from "./pick-time-zone";

/** Read the current zone for actions such as picking or exporting a file. */
export function deviceTimeZone(): string {
  return pickTimeZone(
    getCalendars()[0]?.timeZone,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

/** Re-render calendar views when the operating system reports a zone change. */
export function useDeviceTimeZone(): string {
  const calendarZone = useCalendars()[0]?.timeZone;
  return useMemo(
    () => pickTimeZone(calendarZone, Intl.DateTimeFormat().resolvedOptions().timeZone),
    [calendarZone],
  );
}
