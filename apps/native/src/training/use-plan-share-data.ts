import { readProgramPlan, watchProgram, type ProgramPlan } from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

/** Refresh full prescriptions whenever any Program or Workout table changes. */
export function usePlanShareData(id: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchProgram>[0],
      onValue: (value: ProgramPlan | null) => void,
      onError: () => void,
    ) => {
      let generation = 0;
      const stop = watchProgram(database, id, {
        onProgram: () => {
          const current = ++generation;
          void readProgramPlan(database, id).then(
            (plan) => {
              if (current === generation) onValue(plan);
            },
            () => {
              if (current === generation) onError();
            },
          );
        },
        onError,
      });
      return () => {
        generation++;
        stop();
      };
    },
    [id],
  );
  return useLocalWatch(subscribe);
}
