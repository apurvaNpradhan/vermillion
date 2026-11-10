import { watchSessionsBetween, type FinishedSession } from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

/** Bounded by the store's 500-session limit, with a stable range across renders. */
export function useSessionHistory() {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchSessionsBetween>[0],
      onValue: (value: FinishedSession[]) => void,
      onError: () => void,
    ) =>
      watchSessionsBetween(
        database,
        { from: "0001-01-01T00:00:00.000Z", to: "9999-01-01T00:00:00.000Z" },
        { onSessions: onValue, onError },
      ),
    [],
  );
  const state = useLocalWatch(subscribe);
  return {
    sessions: state.value ?? [],
    loading: state.loading,
    failed: state.failed,
    retry: state.retry,
  };
}
