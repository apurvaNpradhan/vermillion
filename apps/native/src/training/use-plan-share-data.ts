import { watchProgramPlan, type ProgramPlan } from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

/** The Program's full plan for Share cards, re-read on any Program, Workout or exercise write. */
export function usePlanShareData(id: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchProgramPlan>[0],
      onValue: (value: ProgramPlan | null) => void,
      onError: () => void,
    ) => watchProgramPlan(database, id, { onPlan: onValue, onError }),
    [id],
  );
  return useLocalWatch(subscribe);
}
