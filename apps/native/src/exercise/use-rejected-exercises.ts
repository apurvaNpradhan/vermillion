import {
  REJECTED_WRITES_LIMIT,
  discardRejectedWrite,
  rejectedExerciseTitle,
  watchRejectedWrites,
  type RejectedWrite,
} from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData, useSyncStatus } from "@/sync";

export type RejectedExercise = { write: RejectedWrite; title: string | null };

/**
 * Writes the server refused for exercises, from the local-only table (ADR 0018), each named by
 * the exercise's title. They stay on the device until the user discards them. Nothing here logs
 * a payload.
 */
export function useRejectedExercises() {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const writeScope = snapshot?.writeScope ?? "";
  const database = local?.status === "ready" ? local.database : null;
  const [items, setItems] = useState<RejectedExercise[]>([]);

  useEffect(() => {
    if (!database) return;
    let current = 0;
    const stop = watchRejectedWrites(
      database,
      {
        onResult: ({ writes }) => {
          const mine = writes;
          current += 1;
          const run = current;
          void Promise.all(
            mine.map(async (write) => ({
              write,
              title: await rejectedExerciseTitle(database, write).catch(() => null),
            })),
          ).then((named) => {
            if (run === current) setItems(named);
          });
        },
        onError: () => undefined,
      },
      REJECTED_WRITES_LIMIT,
      "exercise",
    );
    return () => {
      current += 1;
      stop();
    };
  }, [database]);

  return {
    rejected: items,
    discard: async (id: string) => {
      if (!database) throw new Error("Local storage is not available");
      await discardRejectedWrite(database, id, writeScope);
    },
  };
}
