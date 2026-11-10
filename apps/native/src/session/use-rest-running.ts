import { useEffect, useReducer } from "react";

import type { Countdown } from "./clock";
import { restView } from "./rest-rules";

/**
 * Whether the Session's Rest is running now. It re-renders its screen once, when the Rest ends (not
 * every second), so a row can drop what only belongs to the resting moment ("+ Add set").
 */
export function useRestRunning(rest: Countdown | null): boolean {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const endsAt = rest?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return;
    const wait = Date.parse(endsAt) - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(refresh, wait + 50);
    return () => clearTimeout(timer);
  }, [endsAt]);
  return rest !== null && restView(rest, Date.now()).running;
}
