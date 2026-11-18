import { calendarDay } from "@workspace/shared";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { nextCheckDelay, sameDayOrNow } from "./today";

/**
 * The local date every date-bound screen agrees on: `now` and `today` (a UTC calendar-day number
 * of the day in `timezone`). It is read when the screen mounts, again at local midnight and when
 * the app returns to the foreground, and it keeps the same `now` until the day changes, so a
 * screen left open across midnight moves to the new day without re-rendering all day.
 */
export function useToday(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const next = new Date();
      setNow((current) => sameDayOrNow(current, next, timezone));
      clearTimeout(timer);
      timer = setTimeout(refresh, nextCheckDelay(next, timezone));
    };
    // A changed time zone is a changed day too: check straight away.
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [timezone]);
  return useMemo(() => ({ now, today: calendarDay(now, timezone) }), [now, timezone]);
}
