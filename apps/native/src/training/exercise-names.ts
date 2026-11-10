/** The first few exercise titles of a Workout and how many more there are. */
export type ExerciseNames = { shown: string[]; more: number };

/**
 * The titles a Workout row lists under its meta line: the first `limit` known titles in order
 * and the count of the rest. Exercises whose library row has not arrived (no title) are left out.
 */
export function exerciseNames(
  exercises: readonly { title: string | null }[],
  limit = 2,
): ExerciseNames {
  const titles = exercises.flatMap((entry) => (entry.title === null ? [] : [entry.title]));
  return { shown: titles.slice(0, limit), more: Math.max(0, titles.length - limit) };
}
