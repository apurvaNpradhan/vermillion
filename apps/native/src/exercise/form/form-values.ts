import type { ExerciseDetail } from "@workspace/sync";

import type { ExerciseFormValues } from "./exercise-draft";

/** The form's values for a saved exercise. */
export function formValuesOf(exercise: ExerciseDetail): ExerciseFormValues {
  return {
    title: exercise.title,
    equipment: exercise.equipment,
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles,
    exerciseType: exercise.exerciseType,
    notes: exercise.instructions ?? "",
  };
}
