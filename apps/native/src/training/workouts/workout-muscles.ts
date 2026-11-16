import { MUSCLE_GROUPS, type MuscleGroup } from "@workspace/shared";

/** Coverage, not an estimate of effective volume: direct targets and assisting muscles differ. */
export function workoutMuscles(
  exercises: readonly {
    primaryMuscle: MuscleGroup | null;
    secondaryMuscles?: readonly MuscleGroup[];
  }[],
) {
  const primary = new Set<MuscleGroup>();
  const secondary = new Set<MuscleGroup>();
  for (const exercise of exercises) {
    if (exercise.primaryMuscle !== null) primary.add(exercise.primaryMuscle);
    for (const muscle of exercise.secondaryMuscles ?? []) secondary.add(muscle);
  }
  for (const muscle of primary) secondary.delete(muscle);
  return {
    primary: MUSCLE_GROUPS.filter((muscle) => primary.has(muscle)),
    secondary: MUSCLE_GROUPS.filter((muscle) => secondary.has(muscle)),
  };
}
