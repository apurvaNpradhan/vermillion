import {
  gridCapInUnit,
  type Ghosts,
  type SessionHistory,
  type SuggestionSettings,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { loggingHistory, plannedSuggestion } from "../../platform/training/workout-suggestion";
import { ghostsOf, previousOfRow } from "./set-values";

export type { SuggestionSettings };

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
  if (capKg === null || ghosts.weight == null) return ghosts;
  return ghosts.weight > capKg ? { ...ghosts, weight: capKg } : ghosts;
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
            loggingHistory(history, exercise.exercise?.equipment ?? "other", settings),
            exercise.sets,
            index,
            true,
          ),
          set.target,
          exercise.logEffort,
          exerciseSuggestion(exercise, history, settings)?.sets[index],
          exercise.repeated,
        ),
        gridCapInUnit(settings.grid ?? null, settings.weightUnit),
      )
    : {};
}
