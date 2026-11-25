import type { ExerciseType } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";
import { effectiveWeight, estimatedOneRepMax } from "../volume/volume";
import { isBaselinePhase, type Phase } from "../phases/phases";
import type { SetKind } from "../vocabulary/vocabulary";
import { loadIdentity } from "../vocabulary/format";
import { outsideLighterWeeks, type LighterPeriod } from "./lighter-week";

const DAY_MS = 86_400_000;
/** The most recent Sessions that must show no gain for a lift to count as stalled. */
export const STALL_SESSIONS = 3;
/** The recent best has to beat the Session before by this much, or the lift has stalled. */
const MIN_GAIN = 1.01;
/** A gap this long between Sessions is a break, not a stall. */
const BREAK_DAYS = 14;

/** What a stall needs of a Session: when it started and its sets of the exercise. */
export type StallSession = {
  started_at: string;
  sets: readonly LoggedSet[];
  /** A Test or Deload phase Session does not count towards a stall. */
  phase?: Phase | null;
};

/**
 * One Session's score for the exercise, the best Counted set: estimated 1RM for loaded lifts
 * (a weighted bodyweight lift with its effective weight), best reps for reps-only ones. Null when
 * the Session has no scorable set, and always for types a stall is not defined for.
 */
type SessionScores = { strength: number | null; volume: number | null };

function sessionScores(
  sets: readonly LoggedSet[],
  type: ExerciseType,
  bodyweightKg: number | null = null,
): SessionScores {
  let best: number | null = null;
  let volume: number | null = null;
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
      if (weight !== null && weight > 0) {
        score = estimatedOneRepMax(weight, set.reps);
        volume = Math.max(volume ?? 0, weight * set.reps);
      }
    }
    if (score !== null && (best === null || score > best)) best = score;
  }
  return { strength: best, volume };
}

export function sessionScore(
  sets: readonly LoggedSet[],
  type: ExerciseType,
  bodyweightKg: number | null = null,
): number | null {
  const scores = sessionScores(sets, type, bodyweightKg);
  return scores.strength ?? scores.volume;
}

export const wasStallDeload = ({ sets }: StallSession): boolean =>
  sets.some((set) => isCounted(set) && set.stall_deload);

/**
 * How many Sessions in a row a lift has stalled, 0 when it has not. `history` is the exercise's
 * Sessions newest first, from the same Workout when one is known. The best of the most recent
 * three Sessions has not improved on the Session before them, and none of those three came after
 * a gap of 14 days or more (a break is not a stall). It needs at least four scored Sessions;
 * Sessions in a Lighter week do not count. A Test or Deload phase Session is not scored (it is
 * not a baseline) but it is training: it fills a gap, so a Deload every fourth week is not a
 * break. A stall of more than three Sessions keeps counting while the best of the recent Sessions
 * still has not beaten the one before them by 1%.
 */
export function stalledSessions(
  history: readonly StallSession[],
  type: ExerciseType,
  options: {
    bodyweightKg?: number | null;
    lighterWeeks?: readonly LighterPeriod[];
    /** A matching baseline from another Workout can start the episode too. */
    sinceDeload?: string;
  } = {},
): number {
  const lastDeload = history.findIndex(wasStallDeload);
  const since = lastDeload < 0 ? history : history.slice(0, lastDeload);
  const opened = options.sinceDeload ? Date.parse(options.sinceDeload) : -Infinity;
  const episode = since.filter((session) => Date.parse(session.started_at) > opened);
  const trained = outsideLighterWeeks(episode, options.lighterWeeks ?? []).flatMap((session) => {
    const performance = performanceByKind(session.sets, type, options.bodyweightKg);
    return performance.size === 0
      ? []
      : [
          {
            at: Date.parse(session.started_at),
            baseline: isBaselinePhase(session.phase),
            performance,
          },
        ];
  });
  // Only baselines are scored. A gap is measured over everything trained, so a Deload or Test
  // Session between two baselines shortens it. Compare only the baselines since the last gap.
  const sessions: Map<SetKind, StallPerformance>[] = [];
  let gap = false;
  let previous: number | null = null;
  for (const item of trained) {
    if (sessions.length > 0 && previous !== null && previous - item.at >= BREAK_DAYS * DAY_MS)
      gap = true;
    previous = item.at;
    if (!item.baseline) continue;
    if (gap) break;
    sessions.push(item.performance);
  }
  const recent = new Map<SetKind, StallPerformance>();
  let stalled = 0;
  for (const [index, before] of sessions.entries()) {
    if (index >= STALL_SESSIONS) {
      const comparable = [...before].flatMap(([kind, values]) => {
        const after = recent.get(kind);
        return after ? [{ after, values }] : [];
      });
      if (
        comparable.length === 0 ||
        comparable.some(({ after, values }) => improvedOn(after, values))
      )
        break;
      stalled = index;
    }
    for (const [kind, values] of before) {
      const after = recent.get(kind);
      if (!after) {
        recent.set(kind, values);
        continue;
      }
      if (values.strength !== null) after.strength = Math.max(after.strength ?? 0, values.strength);
      if (values.qualifyingLoad !== null)
        after.qualifyingLoad = Math.max(after.qualifyingLoad ?? 0, values.qualifyingLoad);
      for (const [load, reps] of values.repsByLoad)
        after.repsByLoad.set(load, Math.max(after.repsByLoad.get(load) ?? 0, reps));
    }
  }
  return stalled;
}

type StallPerformance = {
  strength: number | null;
  maxLoad: number | null;
  qualifyingLoad: number | null;
  repsByLoad: Map<number, number>;
};

function performanceByKind(
  sets: readonly LoggedSet[],
  type: ExerciseType,
  bodyweightKg?: number | null,
): Map<SetKind, StallPerformance> {
  const groups = new Map<SetKind, LoggedSet[]>();
  for (const set of sets) {
    const group = groups.get(set.kind) ?? [];
    group.push(set);
    groups.set(set.kind, group);
  }
  const result = new Map<SetKind, StallPerformance>();
  for (const [kind, group] of groups) {
    if (sessionScore(group, type, bodyweightKg) !== null)
      result.set(kind, stallPerformance(group, type, bodyweightKg));
  }
  return result;
}

function stallPerformance(
  sets: readonly LoggedSet[],
  type: ExerciseType,
  bodyweightKg?: number | null,
): StallPerformance {
  const repsByLoad = new Map<number, number>();
  let maxLoad: number | null = null;
  let qualifyingLoad: number | null = null;
  for (const set of sets) {
    if (!isCounted(set) || set.reps == null) continue;
    const load = loadIdentity(set.weight_kg ?? 0);
    repsByLoad.set(load, Math.max(repsByLoad.get(load) ?? 0, set.reps));
    maxLoad = Math.max(maxLoad ?? 0, load);
    if (set.reps >= (set.target?.reps_min ?? 1))
      qualifyingLoad = Math.max(qualifyingLoad ?? 0, load);
  }
  return {
    strength: sessionScores(sets, type, bodyweightKg).strength,
    maxLoad,
    qualifyingLoad,
    repsByLoad,
  };
}

function improvedOn(recent: StallPerformance, before: StallPerformance): boolean {
  if (
    recent.qualifyingLoad !== null &&
    before.maxLoad !== null &&
    recent.qualifyingLoad > before.maxLoad
  )
    return true;
  if (
    recent.strength !== null &&
    before.strength !== null &&
    recent.strength >= before.strength * MIN_GAIN
  )
    return true;
  for (const [load, reps] of before.repsByLoad) {
    if ((recent.repsByLoad.get(load) ?? 0) > reps) return true;
  }
  return false;
}
