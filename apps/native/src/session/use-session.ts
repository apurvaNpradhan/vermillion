import { watchSession, type SessionDetail } from "@workspace/sync";
import { useCallback } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; session: SessionDetail }
  | { status: "missing" }
  | { status: "error"; retry: () => void };

/** One Session with its exercises and sets, live from the local database. */
export function useSession(id: string): SessionState {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchSession>[0],
      onValue: (value: SessionDetail | null) => void,
      onError: () => void,
    ) => watchSession(database, id, { onSession: onValue, onError }),
    [id],
  );
  const state = useLocalWatch(subscribe);
  if (state.failed) return { status: "error", retry: state.retry };
  if (state.loading || state.value === undefined) return { status: "loading" };
  return state.value === null ? { status: "missing" } : { status: "ready", session: state.value };
}
