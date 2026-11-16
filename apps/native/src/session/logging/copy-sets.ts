import { SET_FIELDS, type SetField, type SetValues } from "@workspace/shared";
import type { SessionExerciseDetail, SessionSetDetail, SetPatch } from "@workspace/sync";
import { previousPatch } from "./set-values";

/** What is typed in a cell but not saved yet. */
export type CopyDraft = { setId: string; field: SetField; value: number | null };

const KEY_OF_FIELD = {
  weight: "weight_kg",
  reps: "reps",
  duration: "duration_s",
  distance: "distance_m",
  floors: "floors",
  steps: "steps",
} as const satisfies Record<SetField, keyof SetValues>;

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
  /** The keypad's unsaved value, read over the stored set it belongs to. */
  draft: CopyDraft | null = null,
): { id: string; patch: SetPatch }[] {
  const index = exercise.sets.findIndex((set) => set.id === setId);
  const current = exercise.sets[index];
  if (!current) return [];
  const source = mode === "remaining" ? current : exercise.sets[index - 1];
  const stored = source ? valuesOf(source) : previous;
  const values =
    stored && source && draft?.setId === source.id
      ? { ...stored, [KEY_OF_FIELD[draft.field]]: draft.value }
      : stored;
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
