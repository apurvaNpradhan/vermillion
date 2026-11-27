/** Search and sort appear once there are more standalone Workouts than this. */
export const WORKOUT_TOOLS_AFTER = 8;

/** How the standalone Workouts are ordered: last done first, or by name. */
export type WorkoutSort = "recent" | "name";

/** Whether the Workouts list is long enough to offer search and sort. */
export const showWorkoutTools = (count: number) => count > WORKOUT_TOOLS_AFTER;

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

type WorkoutRow = {
  id: string;
  createdAt: string;
  exercises: readonly { title: string | null }[];
};

export function indexWorkouts<Workout extends WorkoutRow>(
  workouts: readonly Workout[],
  nameOf: (workout: Workout) => string,
) {
  return workouts.map((workout) => {
    const name = fold(nameOf(workout));
    const exercises = workout.exercises.map((entry) => entry.title ?? "").join(" ");
    return { workout, name, searchKey: `${name} ${fold(exercises)}` };
  });
}

/** Every search word must match somewhere in the title or exercises. */
export function listWorkouts<Workout extends WorkoutRow>(input: {
  workouts: ReturnType<typeof indexWorkouts<Workout>>;
  query: string;
  sort: WorkoutSort;
  lastDone: ReadonlyMap<string, string>;
}): Workout[] {
  const words = fold(input.query).split(/\s+/).filter(Boolean);
  const found = input.workouts.filter(({ searchKey }) =>
    words.every((word) => searchKey.includes(word)),
  );
  if (input.sort === "name") {
    return found
      .sort((a, b) => a.name.localeCompare(b.name) || a.workout.id.localeCompare(b.workout.id))
      .map(({ workout }) => workout);
  }
  return found
    .sort(({ workout: a }, { workout: b }) => {
      const left = input.lastDone.get(a.id) ?? null;
      const right = input.lastDone.get(b.id) ?? null;
      if (left !== null && right !== null && left !== right) return right.localeCompare(left);
      if ((left === null) !== (right === null)) return left === null ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
    })
    .map(({ workout }) => workout);
}
