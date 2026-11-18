import type { MuscleGroup } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";

export type MuscleLoad = { muscle: MuscleGroup; sets: number };

/** What the distribution needs of an exercise: the muscles it works. */
export type DistributionExercise = {
  id: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: readonly MuscleGroup[];
};

/**
 * Sets per muscle over the Counted sets: 1 for the exercise's primary muscle and 0.5 for each
 * secondary. Ranked, most sets first (ties by name). A set whose exercise is not in `exercises`
 * adds nothing.
 */
export function muscleDistribution(
  sets: readonly LoggedSet[],
  exercises: readonly DistributionExercise[],
): MuscleLoad[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return distributeSets(
    sets.flatMap((set) => {
      const exercise = byId.get(set.exercise_id);
      return exercise && isCounted(set) ? [{ ...exercise, count: 1 }] : [];
    }),
  );
}

export function distributeSets(
  exercises: readonly (Omit<DistributionExercise, "id"> & { count: number })[],
): MuscleLoad[] {
  const totals = new Map<MuscleGroup, number>();
  const add = (muscle: MuscleGroup, amount: number) =>
    totals.set(muscle, (totals.get(muscle) ?? 0) + amount);
  for (const exercise of exercises) {
    if (exercise.count <= 0) continue;
    add(exercise.primary_muscle, exercise.count);
    for (const muscle of new Set(exercise.secondary_muscles)) {
      if (muscle !== exercise.primary_muscle) add(muscle, exercise.count * 0.5);
    }
  }
  return [...totals]
    .map(([muscle, count]) => ({ muscle, sets: count }))
    .sort((a, b) => b.sets - a.sets || (a.muscle < b.muscle ? -1 : 1));
}
