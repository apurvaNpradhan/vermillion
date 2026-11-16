/** One row of the Train list: a quiet group heading or a Workout. */
export type TrainRow<Workout extends { id: string }> =
  | { kind: "heading"; id: "program" | "other" }
  | { kind: "workout"; workout: Workout; owned: boolean };

/**
 * The one Train list. With an active Program, its Workouts come first in Rotation order (a Workout
 * that fills several Slots appears once), then every other Workout under "other". Without one it
 * is all Workouts, newest first, with no headings. `owned` marks Workouts a Program owns, which
 * are copied and deleted in the Program, not here.
 */
export function trainRows<Workout extends { id: string }>(input: {
  workouts: readonly Workout[];
  /** The active Program's Workout ids in Rotation order, repeats allowed; null when none is active. */
  activeWorkoutIds: readonly (string | null)[] | null;
  /** Ids of the Workouts every Program owns. */
  ownedIds: ReadonlySet<string>;
}): TrainRow<Workout>[] {
  const byId = new Map(input.workouts.map((workout) => [workout.id, workout]));
  const row = (workout: Workout): TrainRow<Workout> => ({
    kind: "workout",
    workout,
    owned: input.ownedIds.has(workout.id),
  });
  if (input.activeWorkoutIds === null) return input.workouts.map(row);
  const first = new Set<string>();
  for (const id of input.activeWorkoutIds) if (id !== null) first.add(id);
  const program = [...first].flatMap((id) => {
    const workout = byId.get(id);
    return workout ? [row(workout)] : [];
  });
  const other = input.workouts.filter((workout) => !first.has(workout.id)).map(row);
  return [
    ...(program.length > 0
      ? [{ kind: "heading" as const, id: "program" as const }, ...program]
      : []),
    ...(other.length > 0 ? [{ kind: "heading" as const, id: "other" as const }, ...other] : []),
  ];
}
