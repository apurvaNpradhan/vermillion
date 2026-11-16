/**
 * The history Previous, Ghost values and the progression suggestion read for an exercise (ADR 0038).
 * A Session started from a Workout prefers that Workout's own finished Sessions: the same lift
 * done fresh on one day and tired on another is compared with itself. When none of them contains
 * the exercise, or the Session has no Workout, every Session counts. The order is kept.
 */
export function historyForWorkout<Session extends { workoutId: string | null }>(
  history: readonly Session[],
  workoutId: string | null,
): readonly Session[] {
  if (workoutId === null) return history;
  const same = history.filter((session) => session.workoutId === workoutId);
  return same.length > 0 ? same : history;
}
