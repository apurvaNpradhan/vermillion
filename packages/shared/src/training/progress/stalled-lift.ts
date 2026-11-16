import type { ExerciseType } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";
import { historyForWorkout } from "../logging/history-for-workout";
import { effectiveWeight, estimatedOneRepMax } from "../volume/volume";
import { outsideLighterWeeks, type LighterPeriod } from "./lighter-week";

const DAY_MS = 86_400_000;
/** The most recent Sessions that must show no gain for a lift to count as stalled. */
export const STALL_SESSIONS = 3;
/** The recent best has to beat the Session before by this much, or the lift has stalled. */
const MIN_GAIN = 1.01;
/** A gap this long between Sessions is a break, not a stall. */
const BREAK_DAYS = 14;

/** What a stall needs of a Session: when it started and its sets of the exercise. */
export type StallSession = { started_at: string; sets: readonly LoggedSet[] };

/**
 * One Session's score for the exercise, the best Counted set: estimated 1RM for loaded lifts
 * (a weighted bodyweight lift with its effective weight), best reps for reps-only ones. Null when
 * the Session has no scorable set, and always for types a stall is not defined for.
 */
export function sessionScore(
  sets: readonly LoggedSet[],
  type: ExerciseType,
  bodyweightKg: number | null = null,
): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (!isCounted(set) || set.reps == null) continue;
    let score: number | null = null;
    if (type === "reps_only" || type === "bodyweight_reps") score = set.reps;
    else if (type === "weight_reps" || type === "bodyweight_weighted_reps") {
      const weight = effectiveWeight(
        type,
        set.weight_kg,
        set.bodyweight_kg === undefined ? bodyweightKg : set.bodyweight_kg,
      );
      score = weight === null ? null : estimatedOneRepMax(weight, set.reps);
    }
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/**
 * How many Sessions in a row a lift has stalled, 0 when it has not. `history` is the exercise's
 * Sessions newest first, from the same Workout when one is known. The best of the most recent
 * three Sessions has not beaten the Session before them by 1%, and none of those three came after
 * a gap of 14 days or more (a break is not a stall). It needs at least four scored Sessions;
 * Sessions in a Lighter week do not count. A stall of more than three Sessions keeps counting while
 * the best of the recent Sessions still has not beaten the one before them by 1%.
 */
export function stalledSessions(
  history: readonly StallSession[],
  type: ExerciseType,
  options: { bodyweightKg?: number | null; lighterWeeks?: readonly LighterPeriod[] } = {},
): number {
  const sessions = outsideLighterWeeks(history, options.lighterWeeks ?? []).flatMap((session) => {
    const score = sessionScore(session.sets, type, options.bodyweightKg ?? null);
    return score === null ? [] : [{ at: Date.parse(session.started_at), score }];
  });
  let stalled = 0;
  for (let recent = STALL_SESSIONS; recent < sessions.length; recent += 1) {
    const before = sessions[recent];
    const window = sessions.slice(0, recent);
    if (!before) break;
    const gap = window.some((session, index) => {
      const previous = sessions[index + 1];
      return previous !== undefined && session.at - previous.at >= BREAK_DAYS * DAY_MS;
    });
    const best = Math.max(...window.map((session) => session.score));
    if (gap || best >= before.score * MIN_GAIN) break;
    stalled = recent;
  }
  return stalled;
}

/**
 * The exercises trained in `thisWeek` that have stalled, in the order they were first trained.
 * Each is judged on its own history from the Workout it was trained in (`historyForWorkout`).
 */
export function stalledExerciseIds(
  thisWeek: readonly { workoutId: string | null; sets: readonly LoggedSet[] }[],
  histories: ReadonlyMap<string, readonly (StallSession & { workoutId: string | null })[]>,
  options: { lighterWeeks?: readonly LighterPeriod[] } = {},
): string[] {
  const seen = new Set<string>();
  const stalled: string[] = [];
  for (const session of thisWeek) {
    for (const set of session.sets) {
      if (!isCounted(set) || seen.has(set.exercise_id)) continue;
      seen.add(set.exercise_id);
      const history = historyForWorkout(histories.get(set.exercise_id) ?? [], session.workoutId);
      if (stalledSessions(history, set.exercise_type, options) > 0) stalled.push(set.exercise_id);
    }
  }
  return stalled;
}
