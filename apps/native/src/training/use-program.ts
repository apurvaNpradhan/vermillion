import { watchProgram, type ProgramDetail } from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData } from "@/sync";

export type ProgramState =
  | { status: "loading" }
  | { status: "ready"; program: ProgramDetail }
  | { status: "missing" }
  | { status: "error" };

/** One Program with its Rotation in order. `missing` once it is deleted (or on another device). */
export function useProgram(id: string): ProgramState {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [result, setResult] = useState<{ id: string; state: ProgramState } | null>(null);

  useEffect(() => {
    if (!database) return;
    return watchProgram(database, id, {
      onProgram: (program) =>
        setResult({
          id,
          state: program ? { status: "ready", program } : { status: "missing" },
        }),
      onError: () => setResult({ id, state: { status: "error" } }),
    });
  }, [database, id]);

  if (local?.status === "unavailable") return { status: "error" };
  return result?.id === id ? result.state : { status: "loading" };
}
