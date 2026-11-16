import {
  suggestNext,
  type LighterPeriod,
  type SessionHistory,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { ghostsOf, previousOfRow } from "./set-values";

/** The increment settings plus what progression reads of the clock and the Lighter weeks. */
export type SuggestionSettings = {
  weightUnit: WeightUnit;
  weightIncrementKg: number | null;
  lighterWeeks?: readonly LighterPeriod[];
  /** The stalled-lift deload was applied to this exercise. */
  deload?: boolean;
};

export function exerciseSuggestion(
  exercise: SessionExerciseDetail,
  history: readonly SessionHistory[],
  settings: SuggestionSettings,
) {
  return !exercise.sourceWorkoutExerciseId
    ? null
    : suggestNext(
        exercise.sets.map((set) => ({ ...set.target, kind: set.kind })),
        history,
        exercise.type,
        exercise.exercise?.equipment ?? "other",
        settings,
        { now: new Date(), lighterWeeks: settings.lighterWeeks, deload: settings.deload },
      );
}
export function loggingGhosts(
  exercise: SessionExerciseDetail,
  index: number,
  history: readonly SessionHistory[],
  settings: SuggestionSettings,
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
