import {
  watchExercise,
  watchSwapCandidates,
  type ExerciseDetail,
  type LibraryRow,
} from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData } from "@/sync";

export type ExerciseState =
  | { status: "loading" }
  | { status: "ready"; exercise: ExerciseDetail }
  | { status: "missing" }
  | { status: "error" };

/**
 * One exercise from the local database. Retired and archived rows resolve too, so history that
 * points at them still opens. `missing` means no row has that id on this device (for example
 * before the catalog has downloaded).
 */
export function useExercise(id: string): ExerciseState {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [result, setResult] = useState<{ id: string; state: ExerciseState } | null>(null);

  useEffect(() => {
    if (!database) return;
    return watchExercise(database, id, {
      onExercise: (exercise) =>
        setResult({
          id,
          state: exercise ? { status: "ready", exercise } : { status: "missing" },
        }),
      onError: () => setResult({ id, state: { status: "error" } }),
    });
  }, [database, id]);

  if (local?.status === "unavailable") return { status: "error" };
  return result?.id === id ? result.state : { status: "loading" };
}

/**
 * Exercises to swap `exercise` for: live, same primary muscle, other equipment, best rank first,
 * at most eight. Empty until the exercise has loaded.
 */
export function useSwapCandidates(exercise: ExerciseDetail | null): LibraryRow[] {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [found, setFound] = useState<{ key: string; rows: LibraryRow[] } | null>(null);
  const id = exercise?.id;
  const primaryMuscle = exercise?.primaryMuscle;
  const equipment = exercise?.equipment;
  const key = `${id}|${primaryMuscle}|${equipment}`;

  useEffect(() => {
    if (!database || id === undefined || primaryMuscle === undefined || equipment === undefined) {
      return;
    }
    return watchSwapCandidates(
      database,
      { id, primaryMuscle, equipment },
      {
        onRows: (rows) => setFound({ key, rows }),
        onError: () => setFound({ key, rows: [] }),
      },
    );
  }, [database, id, primaryMuscle, equipment, key]);

  return found?.key === key ? found.rows : NO_ROWS;
}

const NO_ROWS: LibraryRow[] = [];
