/** A finished Session, as far as "done today" needs it. */
export type FinishedOf = {
  workout_id: string | null;
  finished_at: string;
  title: string;
};

function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

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
  const today = dayIn(timeZone, now);
  let latest: Session | null = null;
  for (const session of sessions) {
    if (session.workout_id !== workoutId) continue;
    const at = new Date(session.finished_at);
    if (Number.isNaN(at.getTime()) || dayIn(timeZone, at) !== today) continue;
    if (latest === null || at.getTime() > Date.parse(latest.finished_at)) latest = session;
  }
  return latest;
}
