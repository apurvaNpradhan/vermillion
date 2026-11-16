import { muscleDistribution, supersetPlaces, type PlannedSet } from "@workspace/shared";
import type { WorkoutDetail } from "@workspace/sync";

/** All non-warm-up kinds are working sets, including drop and failure sets. */
export function setCounts(sets: readonly PlannedSet[]) {
  let working = 0;
  let warmup = 0;
  for (const set of sets) {
    if (set.kind === "warmup") warmup++;
    else working++;
  }
  return { working, warmup };
}

/** Rotation slots count individually, even when they repeat a Workout. */
export function daysPerWeek(slots: readonly { workout: WorkoutDetail | null }[]) {
  return slots.reduce((count, slot) => count + (slot.workout === null ? 0 : 1), 0);
}

/** Day numbers include Rest slots, and repeated Workouts remain separate pages. */
export function workoutDays(slots: readonly { workout: WorkoutDetail | null }[]) {
  return slots.flatMap((slot, index) =>
    slot.workout ? [{ workout: slot.workout, day: index + 1, total: slots.length }] : [],
  );
}

/** Regroup after truncation so a bracket always ends on a visible row. */
export function cardRows(exercises: WorkoutDetail["exercises"]) {
  const shown = exercises.slice(0, 12);
  const places = supersetPlaces(shown, (entry) => entry.supersetGroup);
  return {
    items: shown.map((entry, index) => ({ entry, place: places[index] ?? "none" })),
    more: Math.max(0, exercises.length - shown.length),
  };
}

/** Reuse the Counted-set distribution with each planned set treated as completed. */
export function planLoads(workouts: readonly WorkoutDetail[]) {
  const entries = workouts.flatMap((workout) => workout.exercises);
  return muscleDistribution(
    entries.flatMap((entry) =>
      entry.sets.map((set, index) => ({
        id: `${entry.id}:${index}`,
        exercise_id: entry.exerciseId,
        exercise_type: entry.exercise?.exerciseType ?? "weight_reps",
        kind: set.kind,
        completed_at: "planned",
      })),
    ),
    entries.flatMap((entry) =>
      entry.exercise
        ? [
            {
              id: entry.exerciseId,
              primary_muscle: entry.exercise.primaryMuscle,
              secondary_muscles: entry.exercise.secondaryMuscles,
            },
          ]
        : [],
    ),
  );
}
