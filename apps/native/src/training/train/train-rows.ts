/** One row of the Train list: a Program heading, the "other" heading, or a Workout. */
export type TrainRow<Workout extends { id: string }> =
  | { kind: "program"; id: string; title: string; active: boolean }
  | { kind: "other" }
  | { kind: "workout"; key: string; workout: Workout; owned: boolean };

/**
 * The Train list, grouped so two Workouts with the same name are never side by side without their
 * Program: each Program is a heading with its Workouts beneath in Rotation order (a Workout that
 * fills several Slots appears once), the active Program first. Workouts no Program owns follow
 * under "other"; when there are no Programs they are listed with no heading at all.
 */
export function trainRows<Workout extends { id: string }>(input: {
  workouts: readonly Workout[];
  /** Every Program with its Workout ids in Rotation order; repeats and empty Slots allowed. */
  programs: readonly { id: string; title: string; workoutIds: readonly (string | null)[] }[];
  /** The Program being run, or null. */
  activeProgramId: string | null;
}): TrainRow<Workout>[] {
  const byId = new Map(input.workouts.map((workout) => [workout.id, workout]));
  const owned = new Set<string>();
  const programs = [...input.programs].sort(
    (a, b) => Number(b.id === input.activeProgramId) - Number(a.id === input.activeProgramId),
  );
  const rows: TrainRow<Workout>[] = [];
  for (const program of programs) {
    const seen = new Set<string>();
    const workouts = program.workoutIds.flatMap((id) => {
      const workout = id === null || seen.has(id) ? undefined : byId.get(id);
      if (!workout) return [];
      seen.add(workout.id);
      owned.add(workout.id);
      return [workout];
    });
    if (workouts.length === 0) continue;
    rows.push({
      kind: "program",
      id: program.id,
      title: program.title,
      active: program.id === input.activeProgramId,
    });
    for (const workout of workouts) {
      rows.push({ kind: "workout", key: `${program.id}:${workout.id}`, workout, owned: true });
    }
  }
  const other = input.workouts.filter((workout) => !owned.has(workout.id));
  if (other.length > 0 && rows.length > 0) rows.push({ kind: "other" });
  for (const workout of other) {
    rows.push({ kind: "workout", key: workout.id, workout, owned: false });
  }
  return rows;
}
