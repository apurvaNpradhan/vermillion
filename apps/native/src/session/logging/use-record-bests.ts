import type { useWeight } from "@/body";
import { useLocalData, useSyncValue } from "@/sync";
import { exerciseRecords } from "@workspace/shared";
import { readRecordHistory, watchRecordHistoryChanges } from "@workspace/sync";
import { useEffect, useMemo } from "react";

import { createRecordBestsCache } from "./record-on-tick";

export function useRecordBests(
  session: { id: string; startedAt: string },
  exerciseIds: readonly string[],
  enabled: boolean,
  withBodyweight: ReturnType<typeof useWeight>["withBodyweight"],
) {
  const { id, startedAt } = session;
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const key = [...new Set(exerciseIds)].sort().join("|");
  const cache = useMemo(
    () =>
      database && enabled && scope
        ? createRecordBestsCache(async (exerciseId) =>
            exerciseRecords(
              withBodyweight(await readRecordHistory(database, exerciseId, { id, startedAt })),
            ),
          )
        : null,
    [database, enabled, id, scope, startedAt, withBodyweight],
  );
  useEffect(() => {
    if (!database || !cache || key === "") return;
    const stop = watchRecordHistoryChanges(
      database,
      key.split("|"),
      { id, startedAt },
      cache.clear,
    );
    return () => {
      stop();
      cache.clear();
    };
  }, [cache, database, id, key, startedAt]);
  return cache;
}
