import { SET_FIELDS, type SetValues } from "@workspace/shared";
import type { SessionExerciseDetail, SessionSetDetail, SetPatch } from "@workspace/sync";
import { previousPatch } from "./set-values";

const valuesOf = (set: SessionSetDetail): SetValues => ({
  weight_kg: set.weightKg,
  reps: set.reps,
  duration_s: set.durationS,
  distance_m: set.distanceM,
  floors: set.floors,
  steps: set.steps,
  rpe: set.rpe,
});

/** Copy only entered values; preserve kind, targets, completion and running timers. */
export function copySetUpdates(
  exercise: SessionExerciseDetail,
  setId: string,
  mode: "previous" | "remaining",
  previous: SetValues | null,
): { id: string; patch: SetPatch }[] {
  const index = exercise.sets.findIndex((set) => set.id === setId);
  const current = exercise.sets[index];
  if (!current) return [];
  const source = mode === "remaining" ? current : exercise.sets[index - 1];
  const values = source ? valuesOf(source) : previous;
  if (!values) return [];
  const patch = previousPatch(values, exercise.type, exercise.logEffort);
  if (!SET_FIELDS[exercise.type].some((field) => field === "reps")) delete patch.rpe;
  if (Object.keys(patch).length === 0) return [];
  const targets =
    mode === "previous"
      ? [current]
      : exercise.sets.slice(index + 1).filter((set) => set.completedAt === null);
  return targets.map((set) => ({
    id: set.id,
    patch: set.kind === "warmup" ? { ...patch, rpe: null } : patch,
  }));
}
