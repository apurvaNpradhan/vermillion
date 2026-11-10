import { watchPrograms, type ProgramSummary } from "@workspace/sync";
import { useCallback } from "react";
import { useSyncStatus } from "@/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { trainStatus } from "./train-status";
const NONE: ProgramSummary[] = [];
export function usePrograms() {
  const { snapshot } = useSyncStatus();
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchPrograms>[0],
      onValue: (value: ProgramSummary[]) => void,
      onError: () => void,
    ) => watchPrograms(database, { onPrograms: onValue, onError }),
    [],
  );
  const state = useLocalWatch(subscribe);
  const programs = state.value ?? NONE;
  return {
    programs,
    retry: state.retry,
    status: trainStatus({
      failed: state.failed,
      loading: state.loading,
      count: programs.length,
      snapshot,
    }),
  };
}
