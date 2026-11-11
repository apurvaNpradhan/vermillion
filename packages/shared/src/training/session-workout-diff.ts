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

/** Kinds that keep their own target weight; the rest (but warm-ups) follow the working weight. */
const OWN_WEIGHT_KINDS: ReadonlySet<SetKind> = new Set(["top", "backoff", "myo"]);

/**
 * The weight a planned set of `kind` should take from what was logged: the last logged weight of
 * the same kind for top, back-off and myo sets, the last working weight for working, drop and
 * failure sets, and nothing for warm-ups (their weights are never planned from a session).
 */
export function loggedTargetWeight(
  sets: readonly { kind: SetKind; weightKg: number | null }[],
  kind: SetKind,
): number | null {
  if (kind === "warmup") return null;
  const source = OWN_WEIGHT_KINDS.has(kind) ? kind : "working";
  return [...sets].reverse().find((set) => set.kind === source)?.weightKg ?? null;
}

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
    /** Target weights of the planned sets but warm-ups, in order; `after` is aligned with it. */
    before: (number | null)[];
    after: (number | null)[];
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
      const planned = source.sets.filter((set) => set.kind !== "warmup");
      const before = planned.map((set) => set.weight_kg ?? null);
      const after = planned.map(
        (set) => loggedTargetWeight(entry.sets, set.kind) ?? set.weight_kg ?? null,
      );
      if (after.some((weight, i) => weight !== before[i]))
        targets.push({
          exerciseId: entry.exerciseId,
          workoutExerciseId: source.id,
          before,
          after,
        });
    }
  }
  for (const entry of workout.exercises)
    if (!logged.some((item) => item.sourceWorkoutExerciseId === entry.id))
      structure.push({ kind: "removed", exerciseId: entry.exerciseId });
  return { structure, targets };
}
