import type { PlannedSet } from "./planned-sets";
import type { SetKind } from "./vocabulary";

export type DiffSessionExercise = {
  exerciseId: string;
  sourceWorkoutExerciseId: string | null;
  sets: readonly {
    kind: SetKind;
    weightKg: number | null;
    completedAt: string | null;
    target: PlannedSet | null;
  }[];
};
export type DiffWorkoutExercise = { id: string; exerciseId: string; sets: readonly PlannedSet[] };

/** Structure uses logged sets only. Targets change weight only, never reps or effort. */
export function diffSessionAgainstWorkout(
  session: { exercises: readonly DiffSessionExercise[] },
  workout: { exercises: readonly DiffWorkoutExercise[] },
) {
  const logged = session.exercises.flatMap((entry) => {
    const sets = entry.sets.filter((set) => set.completedAt !== null);
    return sets.length ? [{ ...entry, sets }] : [];
  });
  const structure: {
    kind: "added" | "removed" | "replaced" | "reordered" | "sets";
    exerciseId: string;
    beforeSets?: readonly SetKind[];
    afterSets?: readonly SetKind[];
  }[] = [];
  const targets: {
    exerciseId: string;
    workoutExerciseId: string;
    before: (number | null)[];
    after: number;
  }[] = [];
  for (const [index, entry] of logged.entries()) {
    const source = workout.exercises.find((item) => item.id === entry.sourceWorkoutExerciseId);
    if (!source) structure.push({ kind: "added", exerciseId: entry.exerciseId });
    else if (source.exerciseId !== entry.exerciseId)
      structure.push({ kind: "replaced", exerciseId: entry.exerciseId });
    else {
      if (workout.exercises[index]?.id !== source.id)
        structure.push({ kind: "reordered", exerciseId: entry.exerciseId });
      if (
        source.sets.length !== entry.sets.length ||
        source.sets.some((set, i) => set.kind !== entry.sets[i]?.kind)
      )
        structure.push({
          kind: "sets",
          exerciseId: entry.exerciseId,
          beforeSets: source.sets.map((set) => set.kind),
          afterSets: entry.sets.map((set) => set.kind),
        });
      const weight = [...entry.sets].reverse().find((set) => set.kind === "working")?.weightKg;
      if (
        weight != null &&
        source.sets.some((set) => set.kind !== "warmup" && set.weight_kg !== weight)
      )
        targets.push({
          exerciseId: entry.exerciseId,
          workoutExerciseId: source.id,
          before: source.sets.flatMap((set) =>
            set.kind === "warmup" ? [] : [set.weight_kg ?? null],
          ),
          after: weight,
        });
    }
  }
  for (const entry of workout.exercises)
    if (!logged.some((item) => item.sourceWorkoutExerciseId === entry.id))
      structure.push({ kind: "removed", exerciseId: entry.exerciseId });
  return { structure, targets };
}
