import {
  calendarDay,
  exerciseRecords,
  inSessionOrder,
  isCounted,
  SET_FIELDS,
  type ExerciseType,
  type RecordKey,
  type SetKind,
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
  if (type === "bodyweight_reps" || type === "reps_only") metrics.push("most_reps");
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

/** The set's number among the working sets before it (1-based); other kinds are not numbered. */
export function workingSetNumber(sets: readonly { kind: SetKind }[], index: number): number | null {
  if (sets[index]?.kind !== "working") return null;
  return sets.slice(0, index + 1).filter((set) => set.kind === "working").length;
}

/** The calendar year of a Session in `timezone` (the device's zone when the account has none). */
function sessionYear(startedAt: string, timezone: string | null): number {
  const zone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(calendarDay(startedAt, zone)).getUTCFullYear();
}

/** The years with a Session of this exercise, newest first. */
export function recordYears(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  timezone: string | null,
): number[] {
  const years = new Set<number>();
  for (const session of sessions) {
    if (session.sets.some((set) => set.exercise_id === exerciseId && isCounted(set)))
      years.add(sessionYear(session.started_at, timezone));
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * The best of each record kind within one calendar year, next to the all-time best. A kind the
 * year never set is absent; `date` is the Session that set that year's best. The all-time value
 * is always at least the year's.
 */
export function recordsByYear(
  sessions: readonly SessionHistory[],
  exerciseId: string,
  bodyweightKg: number | null,
  year: number,
  timezone: string | null,
) {
  const allTime = new Map(
    datedRecords(sessions, exerciseId, bodyweightKg).map((record) => [record.key, record.value]),
  );
  const inYear = sessions.filter((session) => sessionYear(session.started_at, timezone) === year);
  return datedRecords(inYear, exerciseId, bodyweightKg).map((record) => ({
    ...record,
    allTime: allTime.get(record.key) ?? record.value,
  }));
}

/** A duration as a clock: "0:45", "40:00", "1:05:00". Never a bare number of seconds. */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** A distance split into its number and unit: "7.0" km, or "850" m below 1 km. */
export interface HumanDistance {
  value: string;
  unit: "km" | "m";
}

/** A distance in metres as a number and a unit, in the locale's decimal separator. */
export function humanDistance(metres: number, locale?: string): HumanDistance {
  if (Math.abs(Math.round(metres)) < 1000) {
    return {
      value: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(metres)),
      unit: "m",
    };
  }
  return {
    value: new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(metres / 1000),
    unit: "km",
  };
}

/** Seconds per kilometre at a speed in metres per second; null when there is no speed. */
export function paceSecondsPerKm(metresPerSecond: number): number | null {
  return metresPerSecond > 0 && Number.isFinite(metresPerSecond) ? 1000 / metresPerSecond : null;
}

/** The pace at a speed in metres per second as "5:43" (per kilometre); "–" without a speed. */
export function formatPace(metresPerSecond: number): string {
  const seconds = paceSecondsPerKm(metresPerSecond);
  return seconds === null ? "–" : formatClock(seconds);
}
