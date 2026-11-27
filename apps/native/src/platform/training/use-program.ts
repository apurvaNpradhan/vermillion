import { watchProgram, type ProgramDetail } from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
export type ProgramState =
  | { status: "loading" }
  | { status: "ready"; program: ProgramDetail }
  | { status: "missing" }
  | { status: "error" };
export function useProgram(id: string): ProgramState {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchProgram>[0],
      onValue: (value: ProgramDetail | null) => void,
      onError: () => void,
    ) => watchProgram(database, id, { onProgram: onValue, onError }),
    [id],
  );
  const state = useLocalWatch(subscribe);
  if (state.failed) return { status: "error" };
  if (state.loading || state.value === undefined) return { status: "loading" };
  return state.value === null ? { status: "missing" } : { status: "ready", program: state.value };
}
