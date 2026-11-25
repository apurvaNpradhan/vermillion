import {
  baselineSessions,
  historyForGym,
  suggestNext,
  type Ghosts,
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
  /** The share of the last load this week's phase asks for (0.9 in a Deload); 1 or absent: none. */
  phaseLoad?: number;
  /** History selected by the Previous source preference, before applying the gym preference. */
  baselineHistory?: readonly SessionHistory[];
  /** Machine, cable and Smith exercises prefer history from this gym for their baseline. */
  gymId?: string | null;
  /** The loads and cap of this gym for the exercise; null is the equipment default. */
  grid?: LoadGrid | null;
};

export function loggingHistory(
  history: readonly SessionHistory[],
  equipment: Equipment,
  settings: SuggestionSettings,
) {
  return historyForGym(settings.baselineHistory ?? history, settings.gymId ?? null, equipment);
}

/** The break clock reads all of the exercise's Sessions, newest first. */
export function plannedSuggestion(
  sets: readonly PlannedSet[],
  history: readonly SessionHistory[],
  exercise: { type: ExerciseType; equipment: Equipment; progressionPerSet: boolean },
  settings: SuggestionSettings,
  now = new Date(),
) {
  return suggestNext(
    sets,
    history,
    exercise.type,
    exercise.equipment,
    { ...settings, progressionPerSet: exercise.progressionPerSet },
    {
      now,
      baselineHistory: loggingHistory(history, exercise.equipment, settings),
      lighterWeeks: settings.lighterWeeks,
      deload: settings.deload,
      phaseLoad: settings.phaseLoad,
      grid: settings.grid,
    },
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
export function capGhostWeight(ghosts: Ghosts, capKg: number | null): Ghosts {
  return capKg !== null && ghosts.weight != null && ghosts.weight > capKg
    ? { ...ghosts, weight: capKg }
    : ghosts;
}

export function loggingGhosts(
  exercise: SessionExerciseDetail,
  index: number,
  history: readonly SessionHistory[],
  settings: SuggestionSettings,
) {
  const set = exercise.sets[index];
  return set
    ? capGhostWeight(
        ghostsOf(
          exercise.type,
          // A hint is derived from a baseline: never from a Test or Deload week's lighter sets.
          previousOfRow(
            baselineSessions(
              loggingHistory(history, exercise.exercise?.equipment ?? "other", settings),
            ),
            exercise.sets,
            index,
          ),
          set.target,
          exercise.logEffort,
          exerciseSuggestion(exercise, history, settings)?.sets[index],
          exercise.repeated,
        ),
        settings.grid?.capKg ?? null,
      )
    : {};
}
