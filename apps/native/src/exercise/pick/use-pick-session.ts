import { useSyncExternalStore } from "react";

import { getPickSession, subscribePickSessions, type PickSession } from "./pick-session";

/** The open picker for `requestId`, or null once it was answered or never existed. */
export function usePickSession(requestId: string): PickSession | null {
  return useSyncExternalStore(
    subscribePickSessions,
    () => getPickSession(requestId),
    () => null,
  );
}
