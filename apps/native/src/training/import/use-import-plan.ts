import {
  importSnapshot,
  previewImportExercises,
  type ImportedPlan,
  type ImportExercisePreview,
} from "@workspace/sync";
import type { ShareSnapshot } from "@workspace/shared";
import { useCallback, useEffect, useState } from "react";

import { useSyncValue, useLocalData } from "@/sync";
import { useTrainingWrite } from "@/training/shared/use-training-write";

/** How a snapshot would land here: its exercises matched against this device's library. */
export function useImportPlan(snapshot: ShareSnapshot) {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const writeScope = useSyncValue((state) => state?.writeScope ?? "");
  const { write } = useTrainingWrite();
  const [exercises, setExercises] = useState<ImportExercisePreview[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!database) return;
    let active = true;
    previewImportExercises(database, snapshot).then(
      (rows) => {
        if (active) setExercises(rows);
      },
      () => {
        if (active) setExercises([]);
      },
    );
    return () => {
      active = false;
    };
  }, [database, snapshot]);

  /** Adds the plan; null when it failed (the write toasts why). */
  const add = useCallback(async (): Promise<ImportedPlan | null> => {
    setBusy(true);
    try {
      return await write((db) => importSnapshot(db, snapshot, writeScope), null);
    } finally {
      setBusy(false);
    }
  }, [snapshot, write, writeScope]);

  return { exercises, busy, add };
}
