import { watchPrograms, type ProgramSummary } from "@workspace/sync";
import { useCallback, useEffect, useState } from "react";

import { useLocalData, useSyncStatus } from "@/sync";

import { trainStatus, type TrainStatus } from "./train-status";

const NONE: ProgramSummary[] = [];

/** The Programs, newest first, from the local database, and what the list can say. */
export function usePrograms() {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!database) return;
    return watchPrograms(database, {
      onPrograms: (next) => {
        setFailed(false);
        setPrograms(next);
      },
      onError: () => setFailed(true),
    });
  }, [database, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setPrograms(null);
    setAttempt((current) => current + 1);
  }, []);

  const status: TrainStatus = trainStatus({
    failed: failed || local?.status === "unavailable",
    loading: local === null || (database !== null && programs === null),
    count: programs?.length ?? 0,
    snapshot,
  });
  return { status, programs: programs ?? NONE, retry };
}
