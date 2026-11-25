import {
  gridCapInUnit,
  setBasis,
  type Ghosts,
  type PrescriptionDraft,
  type Progression,
  type SessionHistory,
  type SuggestionSettings,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { loggingHistory, plannedSuggestion } from "../../platform/training/workout-suggestion";
import { ghostsOf, previousForSuggestion } from "./set-values";

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
  suggestion = exerciseSuggestion(exercise, history, settings),
) {
  const set = exercise.sets[index];
  const saved = exercise.prescription?.sets.find(({ id }) => id === set?.id);
  if (saved) return saved.ghosts;
  return set
    ? capGhostWeight(
        ghostsOf(
          exercise.type,
          // A hint is derived from a baseline: never from a Test or Deload week's lighter sets.
          previousForSuggestion(
            loggingHistory(history, exercise.exercise?.equipment ?? "other", settings),
            settings,
            exercise.sets,
            index,
            set.target,
            true,
          ),
          set.target,
          exercise.logEffort,
          suggestion?.sets[index],
          exercise.repeated,
        ),
        gridCapInUnit(settings.grid ?? null, settings.weightUnit),
      )
    : {};
}

/** Use the recorded per-set outcome in the chip as well as in the logging cells. */
export function snapshotProgression(exercise: SessionExerciseDetail): Progression | null {
  const snapshot = exercise.prescription;
  if (!snapshot?.reason) return null;
  const sets = exercise.sets.map((set) => snapshot.sets.find(({ id }) => id === set.id));
  return {
    reason: snapshot.reason,
    incrementKg: snapshot.incrementKg,
    breakDays: snapshot.breakDays,
    sets: sets.map((set) =>
      set ? { weightKg: set.ghosts.weight ?? null, reps: set.ghosts.reps ?? null } : null,
    ),
    outcomes: sets.map((set) =>
      set?.unadjustedWeightKg === undefined ? (set?.outcome ?? null) : null,
    ),
  };
}

/** What the exercise's sets are now, for comparing with its snapshot ({@link staleSets}). */
export function currentSetsOf(exercise: SessionExerciseDetail) {
  return exercise.sets.map((set) => ({
    id: set.id,
    basis: setBasis(set.kind, set.target),
    completed: set.completedAt !== null,
  }));
}

/**
 * The snapshot to capture for an exercise: what each set is suggested, the reason and cap, the
 * Session gym it was made for, and what each target was (so a later edit can be told apart).
 */
export function prescriptionDraft(
  exercise: SessionExerciseDetail,
  suggestion: Progression | null,
  capKg: number | null,
  ghostsFor: (index: number) => Ghosts,
  gymId: string | null,
): PrescriptionDraft | null {
  const sets = exercise.sets.map(({ id, kind, target }, index) => ({
    id,
    ghosts: ghostsFor(index),
    outcome: suggestion?.outcomes[index] ?? null,
    basis: setBasis(kind, target),
  }));
  if (!sets.some(({ ghosts }) => Object.values(ghosts).some((value) => value != null))) return null;
  return {
    exerciseId: exercise.exerciseId,
    reason: suggestion?.reason ?? null,
    incrementKg: suggestion?.incrementKg ?? 0,
    breakDays: suggestion?.breakDays ?? null,
    capKg,
    gymId,
    sets,
  };
}
