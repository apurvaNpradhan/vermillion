import { useCallback } from "react";
import { watchSessionGym, type TrainingDatabase } from "@workspace/sync";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

/** The gym a Session was trained at, or null (any gym, or a gym that has been deleted). */
export function useSessionGym(sessionId: string): string | null {
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (id: string | null) => void, onError: () => void) =>
      watchSessionGym(db, sessionId, { onGym: onValue, onError: () => onError() }),
    [sessionId],
  );
  return useLocalWatch(subscribe).value ?? null;
}
