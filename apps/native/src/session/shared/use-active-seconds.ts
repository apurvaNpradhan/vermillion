import { sessionActiveSeconds, type SessionClock } from "@workspace/shared";

import { useNow } from "./use-now";

/**
 * Seconds trained so far, ticking once a second while the Session runs and frozen while it is
 * paused. Only small leaf components call this: it re-renders every second.
 */
export function useActiveSeconds(clock: SessionClock, active = true): number {
  const paused = clock.pausedAt === null ? null : Date.parse(clock.pausedAt);
  const now = useNow(active && paused === null);
  // A frozen `now` can predate the pause by a moment; the pause itself is when the clock stopped.
  return sessionActiveSeconds(clock, paused === null ? now : Math.max(now, paused));
}
