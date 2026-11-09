import type { CustomExerciseInput } from "@workspace/shared";

import type { exercise } from "../tables";

export type ExercisePatch = Partial<CustomExerciseInput>;
export type ExerciseRow = typeof exercise.$inferSelect;

/** Column values for the fields present in `patch`; absent fields are left out, not nulled. */
export function patchValues(patch: ExercisePatch) {
  return {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.primary_muscle !== undefined ? { primaryMuscle: patch.primary_muscle } : {}),
    ...(patch.secondary_muscles !== undefined ? { secondaryMuscles: patch.secondary_muscles } : {}),
    ...(patch.equipment !== undefined ? { equipment: patch.equipment } : {}),
    ...(patch.exercise_type !== undefined ? { exerciseType: patch.exercise_type } : {}),
    ...(patch.is_full_bodyweight !== undefined
      ? { isFullBodyweight: patch.is_full_bodyweight }
      : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
  };
}

/** A stored row in the shape of the shared input, to be validated together with a patch. */
export function rowAsInput(row: ExerciseRow) {
  return {
    title: row.title,
    primary_muscle: row.primaryMuscle,
    secondary_muscles: row.secondaryMuscles,
    equipment: row.equipment,
    exercise_type: row.exerciseType,
    is_full_bodyweight: row.isFullBodyweight,
    instructions: row.instructions,
  };
}
