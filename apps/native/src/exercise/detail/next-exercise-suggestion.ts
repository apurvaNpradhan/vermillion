import {
  progresses,
  type ContextSession,
  type PhaseNow,
  type SuggestionAccount,
} from "@workspace/shared";
import type { WorkoutDetail } from "@workspace/sync";
import type { GymLoads } from "@/gym";
import { prepareWorkoutEntry } from "../../platform/training/workout-suggestion";

/** Remaining Slots in the current Cycle first, then the Workouts actually trained. */
export function nextWorkoutCandidates(
  slots: readonly { id: string; workoutId: string | null }[],
  trained: ReadonlySet<string>,
  history: readonly ContextSession[],
): string[] {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (slot.workoutId !== null && !trained.has(slot.id)) ids.add(slot.workoutId);
  }
  for (const session of history) {
    if (
      session.workoutId !== null &&
      session.sets.some((set) => set.completed_at !== null && progresses(set.kind))
    )
      ids.add(session.workoutId);
  }
  return [...ids];
}

export function nextExerciseSuggestion(
  workout: WorkoutDetail,
  exerciseId: string,
  history: readonly ContextSession[],
  gym: GymLoads,
  account: SuggestionAccount,
  week: PhaseNow | null,
  now: Date,
) {
  const original = workout.exercises.find((entry) => entry.exerciseId === exerciseId);
  const exercise = original?.exercise;
  if (!original || !exercise) return null;
  const { entry, input, prescribed } = prepareWorkoutEntry(
    workout,
    original,
    history,
    {
      gymId: gym.gymId,
      grid: gym.gridFor(exerciseId, exercise.equipment, original.unit),
    },
    account,
    week,
    now,
  );
  return {
    workout,
    sets: entry.sets,
    suggestion: prescribed.progression,
    unit: prescribed.unit,
    /** What the engine was asked, so a rule can be previewed on the same footing. */
    input,
  };
}
