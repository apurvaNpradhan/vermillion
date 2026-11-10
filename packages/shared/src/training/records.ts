import { SET_FIELDS } from "../exercise/vocabulary";
import { inSessionOrder, isCounted, type LoggedSet, type SessionHistory } from "./logged-set";
import { effectiveWeight, estimatedOneRepMax, setVolume } from "./volume";

/**
 * What a Record can be about (ADR 0038). Rep records are the heaviest weight for 1 to 12 reps
 * (`reps_8`); pace is metres per second, so larger is better for every key.
 */
export type RecordKey =
  | "heaviest_weight"
  | "estimated_one_rep_max"
  | "set_volume"
  | "session_volume"
  | "longest_duration"
  | "longest_distance"
  | "best_pace"
  | `reps_${number}`;

/** The best value of each kind. */
export type ExerciseBests = Map<RecordKey, number>;

/** The numbers one Counted set can set a Record with. Session volume is summed over sets. */
function setMetrics(set: LoggedSet, bodyweightKg: number | null): [RecordKey, number][] {
  const fields: readonly string[] = SET_FIELDS[set.exercise_type];
  const metrics: [RecordKey, number][] = [];
  const weight = effectiveWeight(set.exercise_type, set.weight_kg, bodyweightKg);
  if (fields.includes("weight") && weight !== null && weight > 0) {
    metrics.push(["heaviest_weight", weight]);
    const reps = set.reps ?? 0;
    const oneRepMax = estimatedOneRepMax(weight, reps);
    if (oneRepMax !== null) metrics.push(["estimated_one_rep_max", oneRepMax]);
    if (reps >= 1 && reps <= 12) metrics.push([`reps_${reps}`, weight]);
  }
  const volume = setVolume(set, bodyweightKg);
  if (volume > 0) metrics.push(["set_volume", volume]);
  const duration = set.duration_s ?? 0;
  const distance = set.distance_m ?? 0;
  if (fields.includes("duration") && duration > 0) metrics.push(["longest_duration", duration]);
  if (fields.includes("distance") && distance > 0) metrics.push(["longest_distance", distance]);
  if (fields.includes("duration") && fields.includes("distance") && duration > 0 && distance > 0) {
    metrics.push(["best_pace", distance / duration]);
  }
  return metrics;
}

/** The Counted sets of one Session by exercise, in display order. */
function countedByExercise(session: SessionHistory): Map<string, LoggedSet[]> {
  const byExercise = new Map<string, LoggedSet[]>();
  for (const set of session.sets) {
    if (!isCounted(set)) continue;
    const list = byExercise.get(set.exercise_id) ?? [];
    list.push(set);
    byExercise.set(set.exercise_id, list);
  }
  return byExercise;
}

const sessionVolumeOf = (sets: readonly LoggedSet[], bodyweightKg: number | null) =>
  sets.reduce((total, set) => total + setVolume(set, bodyweightKg), 0);

function raise(bests: ExerciseBests, key: RecordKey, value: number) {
  if (value > (bests.get(key) ?? 0)) bests.set(key, value);
}

function foldSession(
  bests: Map<string, ExerciseBests>,
  session: SessionHistory,
  bodyweightKg: number | null,
) {
  for (const [exerciseId, sets] of countedByExercise(session)) {
    const exerciseBests = bests.get(exerciseId) ?? new Map<RecordKey, number>();
    for (const set of sets) {
      for (const [key, value] of setMetrics(set, bodyweightKg)) raise(exerciseBests, key, value);
    }
    raise(exerciseBests, "session_volume", sessionVolumeOf(sets, bodyweightKg));
    bests.set(exerciseId, exerciseBests);
  }
}

/**
 * The best of every kind per exercise over the Counted sets of `sessions`. Computed when read, so
 * editing or deleting a Session keeps it consistent. Warm-ups never count.
 */
export function exerciseRecords(
  sessions: readonly SessionHistory[],
  bodyweightKg: number | null = null,
): Map<string, ExerciseBests> {
  const bests = new Map<string, ExerciseBests>();
  for (const session of sessions) foldSession(bests, session, bodyweightKg);
  return bests;
}

/**
 * Which sets were Records at the time, by set id: a set beats every set of that exercise in the
 * Sessions before its own (ordered by start, then id), not its siblings. Only sets with a
 * Record appear. The first Session of an exercise has nothing to beat and flags nothing. A
 * session-volume Record sits on the last Counted set of that exercise in the Session.
 */
export function recordFlags(
  sessions: readonly SessionHistory[],
  bodyweightKg: number | null = null,
): Map<string, RecordKey[]> {
  const flags = new Map<string, RecordKey[]>();
  const bests = new Map<string, ExerciseBests>();
  for (const session of inSessionOrder(sessions)) {
    for (const [exerciseId, sets] of countedByExercise(session)) {
      const earlier = bests.get(exerciseId);
      if (!earlier) continue;
      for (const set of sets) {
        const won = setMetrics(set, bodyweightKg).flatMap(([key, value]) =>
          value > (earlier.get(key) ?? 0) ? [key] : [],
        );
        if (won.length > 0) flags.set(set.id, won);
      }
      const last = sets[sets.length - 1];
      if (last && sessionVolumeOf(sets, bodyweightKg) > (earlier.get("session_volume") ?? 0)) {
        flags.set(last.id, [...(flags.get(last.id) ?? []), "session_volume"]);
      }
    }
    foldSession(bests, session, bodyweightKg);
  }
  return flags;
}
