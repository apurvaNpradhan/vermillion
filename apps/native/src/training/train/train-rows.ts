/** Search and sort appear once there are more standalone Workouts than this. */
export const WORKOUT_TOOLS_AFTER = 8;

/** How the standalone Workouts are ordered: last done first, or by name. */
export type WorkoutSort = "recent" | "name";

/** Whether the Workouts list is long enough to offer search and sort. */
export const showWorkoutTools = (count: number) => count > WORKOUT_TOOLS_AFTER;

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The standalone Workouts of the Train page, searched and sorted. A search matches the name and
 * the exercises (every word must match somewhere). "Recent" puts the last done first, then the
 * ones never done by when they were made; "name" is alphabetical. Ties fall back to the id, so
 * the order never flickers.
 */
export function listWorkouts<
  Workout extends {
    id: string;
    createdAt: string;
    exercises: readonly { title: string | null }[];
  },
>(input: {
  workouts: readonly Workout[];
  query: string;
  sort: WorkoutSort;
  /** Workout id to when it was last done (ISO), for Workouts done lately. */
  lastDone: ReadonlyMap<string, string>;
  /** The name shown for a Workout (its title, or the one derived from its muscles). */
  nameOf: (workout: Workout) => string;
}): Workout[] {
  const words = fold(input.query).split(/\s+/).filter(Boolean);
  const matches = (workout: Workout) => {
    if (words.length === 0) return true;
    const haystack = fold(
      [input.nameOf(workout), ...workout.exercises.map((exercise) => exercise.title ?? "")].join(
        " ",
      ),
    );
    return words.every((word) => haystack.includes(word));
  };
  const found = input.workouts.filter(matches);
  if (input.sort === "name") {
    return [...found].sort(
      (a, b) =>
        fold(input.nameOf(a)).localeCompare(fold(input.nameOf(b))) || a.id.localeCompare(b.id),
    );
  }
  const stamp = (workout: Workout) => input.lastDone.get(workout.id) ?? null;
  return [...found].sort((a, b) => {
    const left = stamp(a);
    const right = stamp(b);
    if (left !== null && right !== null && left !== right) return right.localeCompare(left);
    if ((left === null) !== (right === null)) return left === null ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  });
}
