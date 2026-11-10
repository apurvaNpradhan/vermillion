import {
  exerciseRecords,
  inSessionOrder,
  isCounted,
  SET_FIELDS,
  type ExerciseType,
  type RecordKey,
  type SessionHistory,
} from "@workspace/shared";

export type Metric = RecordKey | "total_reps" | "floors" | "steps";
export function metricsFor(type: ExerciseType): Metric[] {
  const fields: readonly string[] = SET_FIELDS[type];
  const metrics: Metric[] = [];
  if (fields.includes("weight") && fields.includes("reps"))
    metrics.push("heaviest_weight", "estimated_one_rep_max", "set_volume", "session_volume");
  if (type === "bodyweight_reps") metrics.push("set_volume", "session_volume");
  if (fields.includes("reps")) metrics.push("total_reps");
  if (fields.includes("duration")) metrics.push("longest_duration");
  if (fields.includes("distance")) metrics.push("longest_distance");
  if (fields.includes("duration") && fields.includes("distance")) metrics.push("best_pace");
  if (fields.includes("floors")) metrics.push("floors");
  if (fields.includes("steps")) metrics.push("steps");
  if (type === "short_distance_weight") metrics.unshift("heaviest_weight");
  return metrics;
}

/** A Session contributes its own best or total, never the running all-time best. */
export function metricSeries(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  metric: Metric,
  bodyweightKg: number | null,
) {
  return inSessionOrder(sessions).flatMap((session) => {
    const sets = session.sets.filter((set) => set.exercise_id === exerciseId && isCounted(set));
    if (!sets.length) return [];
    const value =
      metric === "total_reps"
        ? sets.reduce((n, set) => n + (set.reps ?? 0), 0)
        : metric === "floors" || metric === "steps"
          ? sets.reduce((n, set) => n + (set[metric] ?? 0), 0)
          : exerciseRecords([{ ...session, sets }], bodyweightKg)
              .get(exerciseId)
              ?.get(metric);
    return value === undefined
      ? []
      : [{ id: session.id, x: Date.parse(session.started_at), y: value }];
  });
}

/** First Session to achieve the current best wins ties. Recomputed after edits/deletions. */
export function datedRecords(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  bodyweightKg: number | null,
) {
  const bests = new Map<RecordKey, { value: number; date: string }>();
  for (const session of inSessionOrder(sessions)) {
    for (const [key, value] of exerciseRecords([session], bodyweightKg).get(exerciseId) ?? []) {
      if (value > (bests.get(key)?.value ?? 0)) bests.set(key, { value, date: session.started_at });
    }
  }
  return [...bests].map(([key, best]) => ({ key, ...best }));
}
