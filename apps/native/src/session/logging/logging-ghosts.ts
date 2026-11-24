import {
  historyForGym,
  suggestNext,
  type LoadGrid,
  type Equipment,
  type ExerciseType,
  type LighterPeriod,
  type PlannedSet,
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
  /** The gym trained at: machine, cable and Smith exercises read this gym's history first. */
  gymId?: string | null;
  /** The loads and cap of this gym for the exercise; null is the equipment default. */
  grid?: LoadGrid | null;
};

export function plannedSuggestion(
  sets: readonly PlannedSet[],
  history: readonly SessionHistory[],
  exercise: { type: ExerciseType; equipment: Equipment; progressionPerSet: boolean },
  settings: SuggestionSettings,
  now = new Date(),
) {
  return suggestNext(
    sets,
    historyForGym(history, settings.gymId ?? null, exercise.equipment),
    exercise.type,
    exercise.equipment,
    { ...settings, progressionPerSet: exercise.progressionPerSet },
    { now, lighterWeeks: settings.lighterWeeks, deload: settings.deload, grid: settings.grid },
  );
}

export function exerciseSuggestion(
  exercise: SessionExerciseDetail,
  history: readonly SessionHistory[],
  settings: SuggestionSettings,
) {
  return !exercise.sourceWorkoutExerciseId
    ? null
    : plannedSuggestion(
        exercise.sets.map((set) => ({ ...set.target, kind: set.kind })),
        history,
        {
          type: exercise.type,
          equipment: exercise.exercise?.equipment ?? "other",
          progressionPerSet: exercise.progressionPerSet,
        },
        settings,
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
        exercise.repeated,
      )
    : {};
}
