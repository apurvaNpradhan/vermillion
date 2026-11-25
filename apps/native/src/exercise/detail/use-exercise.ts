import type { Equipment } from "@workspace/shared";
import {
  watchExercise,
  watchSwapCandidates,
  type ExerciseDetail,
  type LibraryRow,
} from "@workspace/sync";
import { useEffect, useState } from "react";

import { useGymAvailability } from "@/gym";
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

/** Swap candidates and whether the gym has a candidate's equipment. */
export type SwapCandidates = {
  rows: LibraryRow[];
  hasEquipment: (equipment: Equipment) => boolean;
};

/**
 * Exercises to swap `exercise` for: live, same primary muscle and a compatible type, those whose
 * equipment the gym has first (`gymId`, else the gym trained at), then most shared primary
 * details, then best rank, at most eight. Empty until the exercise has loaded. `hasEquipment`
 * says whether the gym has a candidate's equipment, for the "Not here" label.
 */
export function useSwapCandidates(
  exercise: ExerciseDetail | null,
  gymId?: string | null,
): SwapCandidates {
  const here = useGymAvailability(gymId);
  const unavailable = here.unavailable;
  const unavailableKey = unavailable.join(",");
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [found, setFound] = useState<{ key: string; rows: LibraryRow[] } | null>(null);
  const id = exercise?.id;
  const primaryMuscle = exercise?.primaryMuscle;
  const exerciseType = exercise?.exerciseType;
  const primaryDetail = exercise?.primaryDetail;
  const detailKey = primaryDetail?.join(",") ?? "";
  const key = `${id}|${primaryMuscle}|${exerciseType}|${detailKey}|${unavailableKey}`;

  useEffect(() => {
    if (
      !database ||
      id === undefined ||
      primaryMuscle === undefined ||
      exerciseType === undefined
    ) {
      return;
    }
    return watchSwapCandidates(
      database,
      { id, primaryMuscle, exerciseType, primaryDetail, unavailable },
      {
        onRows: (rows) => setFound({ key, rows }),
        onError: () => setFound({ key, rows: [] }),
      },
    );
  }, [database, id, primaryMuscle, exerciseType, primaryDetail, unavailable, key]);

  return { rows: found?.key === key ? found.rows : NO_ROWS, hasEquipment: here.has };
}

const NO_ROWS: LibraryRow[] = [];
