import { suggestNext, type SessionHistory, type WeightUnit } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { ghostsOf, previousOfRow } from "./set-values";

export function exerciseSuggestion(
  exercise: SessionExerciseDetail,
  history: readonly SessionHistory[],
  settings: { weightUnit: WeightUnit; weightIncrementKg: number | null },
) {
  return !exercise.sourceWorkoutExerciseId
    ? null
    : suggestNext(
        exercise.sets.map((set) => ({ ...set.target, kind: set.kind })),
        history.slice(0, 2).map((entry) => entry.sets),
        exercise.type,
        exercise.exercise?.equipment ?? "other",
        settings,
      );
}
export function loggingGhosts(
  exercise: SessionExerciseDetail,
  index: number,
  history: readonly SessionHistory[],
  settings: { weightUnit: WeightUnit; weightIncrementKg: number | null },
) {
  const set = exercise.sets[index];
  return set
    ? ghostsOf(
        exercise.type,
        previousOfRow(history, exercise.sets, index),
        set.target,
        exercise.logEffort,
        exerciseSuggestion(exercise, history, settings)?.sets[index],
      )
    : {};
}
