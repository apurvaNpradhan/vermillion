import { inSessionOrder, isCounted, type LoggedSet, type SessionHistory } from "./logged-set";
import { estimatedOneRepMax, setVolume } from "./volume";
import { isoWeekKey } from "./week";

export type ProgressRange = "3M" | "1Y" | "All";

/** Calendar ranges clamp month ends, rather than spilling into the next month. */
function withinRange(sessions: readonly SessionHistory[], range: ProgressRange, now: number) {
  const start = new Date(now);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  if (range === "3M") start.setUTCMonth(start.getUTCMonth() - 3);
  if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return inSessionOrder(sessions).filter(
    (session) =>
      session.finished_at !== null &&
      Date.parse(session.started_at) <= now &&
      (range === "All" || Date.parse(session.started_at) >= start.getTime()),
  );
}

function bestOf(sets: readonly LoggedSet[], exerciseId: string) {
  let best: { set: LoggedSet; oneRepMax: number } | null = null;
  for (const set of sets) {
    if (set.exercise_id !== exerciseId || !isCounted(set)) continue;
    const oneRepMax = estimatedOneRepMax(set.weight_kg ?? 0, set.reps ?? 0);
    if (oneRepMax !== null && (!best || oneRepMax > best.oneRepMax)) best = { set, oneRepMax };
  }
  return best;
}

export function bestProgressSet(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  range: ProgressRange,
  now: number,
) {
  return bestOf(
    withinRange(sessions, range, now).flatMap((session) => session.sets),
    exerciseId,
  );
}

export function oneRepMaxSeries(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  range: ProgressRange,
  now: number,
) {
  return withinRange(sessions, range, now).flatMap((session) => {
    const best = bestOf(session.sets, exerciseId);
    return best ? [{ id: session.id, x: Date.parse(session.started_at), y: best.oneRepMax }] : [];
  });
}

export function exerciseWeeklyVolume(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  range: ProgressRange,
  now: number,
  timezone: string,
  bodyweightKg: number | null = null,
) {
  const weeks = new Map<string, number>();
  for (const session of withinRange(sessions, range, now)) {
    const key = isoWeekKey(session.started_at, timezone);
    for (const set of session.sets) {
      if (set.exercise_id !== exerciseId || !isCounted(set)) continue;
      weeks.set(key, (weeks.get(key) ?? 0) + setVolume(set, bodyweightKg));
    }
  }
  return [...weeks].map(([id, y]) => ({ id, x: Date.parse(id), y }));
}
