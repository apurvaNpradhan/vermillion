/** A finished Session, as far as "done today" needs it. */
export type FinishedOf = {
  workout_id: string | null;
  finished_at: string;
  title: string;
};

/**
 * The latest Session of `workoutId` finished on the same local day as `now` (in the user's time
 * zone), or null. Starting that Workout again asks once ("You did Upper A today").
 */
export function finishedToday<Session extends FinishedOf>(
  sessions: readonly Session[],
  workoutId: string,
  now: Date,
  timeZone: string,
): Session | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  let latest: Session | null = null;
  let latestAt = -Infinity;
  for (const session of sessions) {
    if (session.workout_id !== workoutId) continue;
    const at = Date.parse(session.finished_at);
    if (!Number.isFinite(at) || at > now.getTime() || at <= latestAt) continue;
    if (formatter.format(at) !== today) continue;
    latest = session;
    latestAt = at;
  }
  return latest;
}
