import { watchActiveSessions, type ActiveSession } from "@workspace/sync";
import { useCallback } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const NONE: ActiveSession[] = [];

/** The unfinished Sessions, newest first. There is normally one; two started offline are both listed. */
export function useActiveSessions() {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchActiveSessions>[0],
      onValue: (value: ActiveSession[]) => void,
      onError: () => void,
    ) => watchActiveSessions(database, { onSessions: onValue, onError }),
    [],
  );
  const state = useLocalWatch(subscribe);
  return { sessions: state.value ?? NONE, loading: state.loading, failed: state.failed };
}
