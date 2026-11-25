import type { ExerciseType } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";
import { effectiveWeight, estimatedOneRepMax } from "../volume/volume";
import { isBaselinePhase, type Phase } from "../phases/phases";
import type { SetKind } from "../vocabulary/vocabulary";
import { loadIdentity } from "../vocabulary/format";
import { outsideLighterWeeks, type LighterPeriod } from "./lighter-week";
import { progresses } from "./progression";
import { fellShortOfSuggestion } from "./suggestion-ledger";

const DAY_MS = 86_400_000;
/** The most recent Sessions that must show no gain for a lift to count as stalled. */
export const STALL_SESSIONS = 3;
/** The most recent Sessions that must all miss their suggestion for a lift to count as stalled. */
export const MISSED_SESSIONS = 3;
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
        score = estimatedOneRepMax(weight, set.reps, set.rpe);
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

/** The rule itself lowered the load for this Session (Linear's reset), by its snapshot. */
const wasRuleReset = ({ sets }: StallSession): boolean =>
  sets.some((set) => isCounted(set) && progresses(set.kind) && set.suggested?.reset === true);

/**
 * What ends a stall episode besides an applied stall deload. A rule that resets the load by
 * itself (Linear) has already answered the stall: the Session it reset starts over.
 */
type EpisodeOptions = { ruleResets?: boolean };

type Baseline = { session: StallSession; performance: Map<SetKind, StallPerformance> };

/**
 * The scored baseline Sessions of the current episode, newest first: after the last applied stall
 * deload, outside Lighter weeks, until a gap of 14 days. A Test or Deload Session is not scored but
 * is training, so it fills a gap.
 */
function episodeBaselines(
  history: readonly StallSession[],
  type: ExerciseType,
  options: {
    bodyweightKg?: number | null;
    lighterWeeks?: readonly LighterPeriod[];
    sinceDeload?: string;
  } & EpisodeOptions,
): Baseline[] {
  const lastDeload = history.findIndex(
    (session) => wasStallDeload(session) || (options.ruleResets === true && wasRuleReset(session)),
  );
  const since = lastDeload < 0 ? history : history.slice(0, lastDeload);
  const opened = options.sinceDeload ? Date.parse(options.sinceDeload) : -Infinity;
  const episode = since.filter((session) => Date.parse(session.started_at) > opened);
  const trained = outsideLighterWeeks(episode, options.lighterWeeks ?? []).flatMap((session) => {
    const performance = performanceByKind(session.sets, type, options.bodyweightKg);
    return performance.size === 0
      ? []
      : [
          {
            session,
            at: Date.parse(session.started_at),
            baseline: isBaselinePhase(session.phase),
            performance,
          },
        ];
  });
  // Only baselines are scored. A gap is measured over everything trained, so a Deload or Test
  // Session between two baselines shortens it. Compare only the baselines since the last gap.
  const baselines: Baseline[] = [];
  let gap = false;
  let previous: number | null = null;
  for (const item of trained) {
    if (baselines.length > 0 && previous !== null && previous - item.at >= BREAK_DAYS * DAY_MS)
      gap = true;
    previous = item.at;
    if (!item.baseline) continue;
    if (gap) break;
    baselines.push({ session: item.session, performance: item.performance });
  }
  return baselines;
}

/**
 * How many Sessions in a row a lift has stalled, 0 when it has not. `history` is the exercise's
 * Sessions newest first, from the same Workout when one is known. The best of the most recent
 * three Sessions has not improved on the Session before them (a Session a rule reset by itself,
 * with `ruleResets`, starts the count over like an applied deload), and none of those three came after
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
  } & EpisodeOptions = {},
): number {
  const sessions = episodeBaselines(history, type, options).map(({ performance }) => performance);
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

/**
 * Whether a Session missed what was suggested for it: more than half of its Counted progressing
 * sets that have a suggestion ended short of it (fewer reps at the suggested load, or a lighter
 * set worth less by estimated 1RM). Null when it has no snapshot to compare with (an older
 * Session): that says nothing, and ends a run of misses.
 */
function missedSuggestion(session: StallSession): boolean | null {
  const worked = session.sets.filter(
    (set) => isCounted(set) && progresses(set.kind) && set.suggested,
  );
  if (worked.length === 0) return null;
  return (
    worked.filter((set) => set.suggested && fellShortOfSuggestion(set.suggested, set)).length * 2 >
    worked.length
  );
}

/**
 * How many Sessions in a row the suggestion was missed and the lift did not gain, 0 until it has
 * happened {@link MISSED_SESSIONS} times. A Session counts only if it also did not improve on the
 * Session before it by the stall rule, so a lifter whose numbers keep rising is not flagged for
 * choosing a different load. Reads the prescription snapshot of each Session, newest first, in
 * the same scope as {@link stalledSessions}: it stops at an applied stall deload (or, for a rule
 * that resets by itself, a Session it reset) or a break, skips
 * a Test or Deload Session and a Lighter week, and ends at a Session that met the suggestion,
 * improved, or has no snapshot.
 */
export function missedSuggestions(
  history: readonly StallSession[],
  type: ExerciseType,
  options: {
    bodyweightKg?: number | null;
    lighterWeeks?: readonly LighterPeriod[];
    sinceDeload?: string;
  } & EpisodeOptions = {},
): number {
  const baselines = episodeBaselines(history, type, options);
  let missed = 0;
  for (const [index, { session, performance }] of baselines.entries()) {
    if (missedSuggestion(session) !== true) break;
    const before = baselines[index + 1]?.performance;
    if (before && improvedAny(performance, before)) break;
    missed += 1;
  }
  return missed >= MISSED_SESSIONS ? missed : 0;
}

function improvedAny(
  recent: Map<SetKind, StallPerformance>,
  before: Map<SetKind, StallPerformance>,
): boolean {
  for (const [kind, values] of before) {
    const after = recent.get(kind);
    if (after && improvedOn(after, values)) return true;
  }
  return false;
}
