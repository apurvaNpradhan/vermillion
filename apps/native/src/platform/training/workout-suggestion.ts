import {
  applyPhase,
  hasLoad,
  historyForGym,
  isTestSingle,
  testWorkingLoad,
  mainEntryOf,
  resolveExerciseUnit,
  suggestionContext,
  suggestNext,
  type ContextSession,
  type Equipment,
  type ExerciseType,
  type PhaseNow,
  type PlannedSet,
  type SessionHistory,
  type SuggestionAccount,
  type SuggestionPlace,
  type SuggestionSettings,
} from "@workspace/shared";
import type { WorkoutDetail, WorkoutExerciseDetail } from "@workspace/sync";

export type { SuggestionSettings };

export function loggingHistory(
  history: readonly SessionHistory[],
  equipment: Equipment,
  settings: SuggestionSettings,
) {
  return settings.baselineHistory ?? historyForGym(history, settings.gymId ?? null, equipment);
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
      bodyweightKg: settings.bodyweightKg,
      baselineHistory: loggingHistory(history, exercise.equipment, settings),
      fixedBaselineHistory: settings.fixedBaselineHistory,
      fixedFallbackHistory: settings.fixedFallbackHistory,
      lighterWeeks: settings.lighterWeeks,
      deload: settings.deload,
      phaseLoad: settings.phaseLoad,
      testSingle: settings.testSingle,
      grid: settings.grid,
    },
  );
}

/** The context for a Workout entry, shared by the preview and its exercise details. */
function workoutEntryContext(
  entry: WorkoutExerciseDetail,
  history: readonly ContextSession[],
  place: Pick<SuggestionPlace, "gymId" | "grid" | "phaseLoad" | "testSingle">,
  account: SuggestionAccount,
  exerciseOrdinal: number,
  duplicateEntry: boolean,
) {
  return suggestionContext(
    history,
    {
      ...place,
      exerciseId: entry.exerciseId,
      sourceWorkoutExerciseId: entry.id,
      exerciseOrdinal,
      duplicateEntry,
      type: entry.exercise?.exerciseType ?? "weight_reps",
      equipment: entry.exercise?.equipment ?? "other",
      unitOverride: entry.unit,
      workoutId: entry.workoutId,
      stalls: true,
      prescription: entry.sets,
    },
    account,
  );
}

/** Apply the same phase and context in both views of an upcoming Workout entry. */
export function prepareWorkoutEntry(
  workout: WorkoutDetail,
  original: WorkoutExerciseDetail,
  history: readonly ContextSession[],
  place: Pick<SuggestionPlace, "gymId" | "grid">,
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
  const entry =
    week && exercise
      ? {
          ...original,
          sets: applyPhase(original.sets, week.phase, {
            isMainLift: main,
            type: exercise.exerciseType,
            equipment: exercise.equipment,
            unit: resolveExerciseUnit(account.unit, original.unit),
            grid: place.grid,
            modifiers: week.modifiers,
            testTop: week.testTop,
            testWorkups: week.testWorkups,
            testLoadKg:
              week.phase === "test" && main && hasLoad(exercise.exerciseType)
                ? testWorkingLoad(history, exercise.exerciseType, {
                    now,
                    bodyweightKg: account.bodyweightKg,
                    lighterWeeks: account.lighterWeeks,
                    single: week.testTop === "single",
                  })
                : null,
          }),
        }
      : original;
  const entries = workout.exercises.filter(({ exerciseId }) => exerciseId === original.exerciseId);
  const context = workoutEntryContext(
    entry,
    history,
    {
      ...place,
      phaseLoad: week?.modifiers.load,
      testSingle: main && isTestSingle(week?.phase, entry.sets),
    },
    account,
    entries.findIndex(({ id }) => id === original.id),
    entries.length > 1,
  );
  return { entry, context };
}
