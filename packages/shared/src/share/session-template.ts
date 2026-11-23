import { SET_FIELDS, type ExerciseType } from "../exercise/vocabulary";
import { plannedSetKeys, plannedSetSchema, type PlannedSet } from "../training/plans/planned-sets";
import type { SetKind } from "../training/vocabulary/vocabulary";

/** The values of one completed Logged set, as the database holds them. */
export type LoggedSetValues = {
  kind: SetKind;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  floors: number | null;
  steps: number | null;
  rpe: number | null;
};

/**
 * What a finished Session shares as a Workout template: each completed set becomes a Planned set
 * whose targets are the values that were logged (a rep count becomes a one-number range, an RPE
 * becomes a one-step effort). Only the fields the exercise's type records are kept, and a set
 * that leaves nothing valid is dropped.
 */
export function sessionPlannedSets(
  exerciseType: ExerciseType,
  logged: readonly LoggedSetValues[],
): PlannedSet[] {
  const fields: readonly string[] = SET_FIELDS[exerciseType];
  const allowed: ReadonlySet<string> = new Set(plannedSetKeys(exerciseType));
  const planned: PlannedSet[] = [];
  for (const set of logged) {
    const values = {
      kind: set.kind,
      weight_kg: fields.includes("weight") ? set.weight_kg : null,
      reps_min: fields.includes("reps") ? set.reps : null,
      reps_max: fields.includes("reps") ? set.reps : null,
      effort_min: fields.includes("reps") ? set.rpe : null,
      effort_max: fields.includes("reps") ? set.rpe : null,
      duration_s: fields.includes("duration") ? set.duration_s : null,
      distance_m: fields.includes("distance") ? set.distance_m : null,
      floors: fields.includes("floors") ? set.floors : null,
      steps: fields.includes("steps") ? set.steps : null,
    };
    const present = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => value !== null && (key === "kind" || allowed.has(key)),
      ),
    );
    // An effort off the RPE steps is dropped rather than the whole set.
    const parsed =
      plannedSetSchema.safeParse(present).data ??
      plannedSetSchema.safeParse(
        Object.fromEntries(Object.entries(present).filter(([key]) => !key.startsWith("effort"))),
      ).data;
    if (parsed) planned.push(parsed);
  }
  return planned;
}
