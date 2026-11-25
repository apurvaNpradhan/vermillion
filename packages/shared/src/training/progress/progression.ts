import type { LoggedSet } from "../logging/logged-set";
import type { Phase } from "../phases/phases";
import type { SetKind, WeightUnit } from "../vocabulary/vocabulary";
import type { LighterPeriod } from "./lighter-week";
import type { LoadGrid } from "./load-grid";

export { incrementFor } from "./progression-steps";

export type IncrementSettings = {
  weightUnit: WeightUnit;
  weightIncrementKg: number | null;
  progressionPerSet?: boolean;
};
export type SuggestedSet = { weightKg: number | null; reps: number | null };

/** Why a suggestion is what it is: a small closed set, each with its own short label. */
export const PROGRESSION_REASONS = [
  "add_weight",
  "add_rep",
  /** The next load is a big jump: the reps climb past the range first. */
  "more_reps",
  "reset",
  "hold_missed",
  "hold_together",
  "hold_effort",
  "after_break",
  "same_as_last",
  "deload",
  "test_single",
  /** A back-off set follows its top set: a share of the top load. */
  "backoff_share",
  /** The last load was above this gym's cap, so the cap is suggested. */
  "capped",
  /** At the cap with reps still to gain: the load stays, the reps climb. */
  "cap_reps",
  /** At the cap and past the extended rep ceiling: add a set or go single-arm. */
  "cap_hint",
] as const;
export type ProgressionReason = (typeof PROGRESSION_REASONS)[number];

export type SetOutcome = {
  reason: ProgressionReason;
  /** Added load, when the set progresses in weight. */
  changeKg?: number;
  /** The suggested load when the last set exceeded the cap. */
  capKg?: number;
  limit?: "plates" | "equipment";
  /** The share of the previous load after snapping to the equipment. */
  loadFactor?: number;
  /** For `more_reps`: the reps to reach before the load goes up. */
  ceiling?: number;
};

export type Progression = {
  reason: ProgressionReason;
  sets: (SuggestedSet | null)[];
  outcomes: (SetOutcome | null)[];
  /** The load the first progressing set adds, in kilograms (what "Add 2.5 kg" shows). */
  incrementKg: number;
  /** Whole days since the last Session with this exercise, for `after_break`; else null. */
  breakDays: number | null;
};

/** What a suggestion needs besides the history: the clock and the Lighter weeks. */
export type ProgressionContext = {
  now: Date;
  /** Fallback when a logged set has no bodyweight snapshot. */
  bodyweightKg?: number | null;
  /**
   * The Sessions the loads and reps are read from, when fewer than the whole `history`: a
   * baseline can prefer the same Workout and, for gym-bound equipment, the same gym. The break
   * clock reads the exercise's full history across Workouts and gyms.
   */
  baselineHistory?: readonly ProgressionSession[];
  /** Whole baseline entries that match the fixed-rep prescription, newest first. */
  fixedBaselineHistory?: readonly ProgressionSession[];
  fixedFallbackHistory?: readonly ProgressionSession[];
  /** Every Lighter week, past and running. Their Sessions are never a baseline. */
  lighterWeeks?: readonly LighterPeriod[];
  /** Suggest the stalled-lift deload: 90% of the last load at the bottom of the range. */
  deload?: boolean;
  /**
   * The load factor of this week's phase (0.9 in a Deload): below 1 it suggests that share of the
   * last load at the bottom of the range, like the stalled-lift deload. Unlike a break, a Lighter
   * week or the stalled-lift deload, which round to the nearest lower load, a phase rounds down only within five percentage
   * points of the intended cut.
   */
  phaseLoad?: number;
  /** The loads this gym can make for the exercise, with its cap; null is the equipment default. */
  grid?: LoadGrid | null;
  /** The Test single uses its explicit target instead of progressing a previous top set. */
  testSingle?: boolean;
};

/** The history a suggestion reads: Sessions newest first, each with its Logged sets. */
export type ProgressionSession = {
  started_at: string;
  sets: readonly LoggedSet[];
  /** The phase the Session started in; Test and Deload Sessions are never a baseline. */
  phase?: Phase | null;
};

const DAY_MS = 86_400_000;
/** Break tiers and their starting shares of the last load. */
const SHORT_BREAK_DAYS = 14;
const LONG_BREAK_DAYS = 28;
const EXTENDED_BREAK_DAYS = 84;
const SHORT_BREAK_LOAD = 0.9;
const LONG_BREAK_LOAD = 0.8;
const EXTENDED_BREAK_LOAD = 0.7;

/** Kinds that progress against their own previous counterparts; the rest only show Previous. */
const PROGRESSING_KINDS: readonly SetKind[] = ["working", "top", "backoff"];
export const progresses = (kind: SetKind) => PROGRESSING_KINDS.includes(kind);

/** The elapsed break and its load share, shared by ordinary progression and Test seeding. */
export function trainingBreak(
  history: readonly {
    started_at: string;
    sets: readonly Pick<LoggedSet, "kind" | "completed_at">[];
  }[],
  now: Date,
) {
  const trained = history.find((session) =>
    session.sets.some((set) => set.completed_at !== null && progresses(set.kind)),
  );
  const days = trained ? Math.floor((now.getTime() - Date.parse(trained.started_at)) / DAY_MS) : 0;
  const load =
    days >= EXTENDED_BREAK_DAYS
      ? EXTENDED_BREAK_LOAD
      : days >= LONG_BREAK_DAYS
        ? LONG_BREAK_LOAD
        : days >= SHORT_BREAK_DAYS
          ? SHORT_BREAK_LOAD
          : 1;
  return { days, load };
}
