import { watchExerciseHistory, type FinishedSession } from "@workspace/sync";
import { useEffect, useState } from "react";
import { useLocalData } from "@/sync";

type HistoryState =
  | { status: "loading" | "error"; sessions: FinishedSession[] }
  | { status: "ready"; sessions: FinishedSession[] };

/** Finished history stays keyed to both database and exercise, including on account changes. */
export function useExerciseHistory(exerciseId: string): HistoryState {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [result, setResult] = useState<{
    database: typeof database;
    id: string;
    state: HistoryState;
  } | null>(null);
  useEffect(() => {
    if (!database) return;
    return watchExerciseHistory(database, exerciseId, {
      onHistory: (sessions) =>
        setResult({ database, id: exerciseId, state: { status: "ready", sessions } }),
      onError: () =>
        setResult({ database, id: exerciseId, state: { status: "error", sessions: [] } }),
    });
  }, [database, exerciseId]);
  if (local?.status === "unavailable") return { status: "error", sessions: [] };
  return result?.database === database && result?.id === exerciseId
    ? result.state
    : { status: "loading", sessions: [] };
}
