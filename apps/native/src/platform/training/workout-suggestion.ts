import {
  isTestSingle,
  mainEntryOf,
  needsTestSeed,
  phaseTargets,
  prescribe,
  testWorkingLoad,
  type ContextSession,
  type LoadGrid,
  type PhaseNow,
  type SuggestionAccount,
} from "@workspace/shared";
import type { WorkoutDetail, WorkoutExerciseDetail } from "@workspace/sync";

/**
 * One upcoming Workout entry as the Session will start it, and what is prescribed for it: this
 * week's phase applied to the targets, then the engine's prescription. The Workout preview and the
 * exercise page read the same thing, and so does the Session once it starts.
 */
export function prepareWorkoutEntry(
  workout: WorkoutDetail,
  original: WorkoutExerciseDetail,
  history: readonly ContextSession[],
  place: { gymId: string | null; grid: LoadGrid | null },
  account: SuggestionAccount,
  week: PhaseNow | null,
  now = new Date(),
) {
  const exercise = original.exercise;
  const main =
    original.id ===
    mainEntryOf(
      workout.exercises.map(({ id }) => id),
      workout.mainEntryId,
    );
  const target = {
    isMainLift: main,
    type: exercise?.exerciseType ?? "weight_reps",
    equipment: exercise?.equipment ?? "other",
    accountUnit: account.unit,
    unitOverride: original.unit,
    grid: place.grid,
  } as const;
  const entry =
    week && exercise
      ? {
          ...original,
          sets: phaseTargets(
            original.sets,
            week,
            target,
            needsTestSeed(week, target)
              ? testWorkingLoad(history, exercise.exerciseType, {
                  now,
                  bodyweightKg: account.bodyweightKg,
                  lighterWeeks: account.lighterWeeks,
                  single: week.testTop === "single",
                })
              : null,
          ),
        }
      : original;
  const entries = workout.exercises.filter(({ exerciseId }) => exerciseId === original.exerciseId);
  const prescribed = prescribe({
    place: {
      exerciseId: entry.exerciseId,
      sourceWorkoutExerciseId: entry.id,
      exerciseOrdinal: entries.findIndex(({ id }) => id === original.id),
      duplicateEntry: entries.length > 1,
      type: exercise?.exerciseType ?? "weight_reps",
      equipment: exercise?.equipment ?? "other",
      unitOverride: entry.unit,
      workoutId: entry.workoutId,
      gymId: place.gymId,
      grid: place.grid,
      phaseLoad: week?.modifiers.load,
      testSingle: main && isTestSingle(week?.phase, entry.sets),
      stalls: true,
    },
    plan: entry.sets,
    history,
    account,
    progressionPerSet: exercise?.progressionPerSet ?? false,
    now,
  });
  return { entry, prescribed };
}
