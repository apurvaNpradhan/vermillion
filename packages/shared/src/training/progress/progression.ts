import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import type { SetKind, WeightUnit } from "../vocabulary/vocabulary";
import {
  LIGHTER_WEEK_LOAD,
  activeLighterWeek,
  outsideLighterWeeks,
  type LighterPeriod,
} from "./lighter-week";
import type { LoadGrid } from "./load-grid";
import { addLoad, incrementFor, lightenLoad } from "./progression-steps";

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
  "hold",
  "hold_effort",
  "after_break",
  "same_as_last",
  "deload",
  /** The last load was above this gym's cap, so the cap is suggested. */
  "capped",
  /** At the cap with reps still to gain: the load stays, the reps climb. */
  "cap_reps",
  /** At the cap and past the extended rep ceiling: add a set or go single-arm. */
  "cap_hint",
] as const;
export type ProgressionReason = (typeof PROGRESSION_REASONS)[number];

export type Progression = {
  reason: ProgressionReason;
  sets: (SuggestedSet | null)[];
  /** The load the first progressing set adds, in kilograms (what "Add 2.5 kg" shows). */
  incrementKg: number;
  /** Whole days since the last Session with this exercise, for `after_break`; else null. */
  breakDays: number | null;
};

/** What a suggestion needs besides the history: the clock and the Lighter weeks. */
export type ProgressionContext = {
  now: Date;
  /** Every Lighter week, past and running. Their Sessions are never a baseline. */
  lighterWeeks?: readonly LighterPeriod[];
  /** Suggest the stalled-lift deload: 90% of the last load at the bottom of the range. */
  deload?: boolean;
  /** The loads this gym can make for the exercise, with its cap; null is the equipment default. */
  grid?: LoadGrid | null;
};

/** The history a suggestion reads: Sessions newest first, each with its Logged sets. */
export type ProgressionSession = { started_at: string; sets: readonly LoggedSet[] };

const DAY_MS = 86_400_000;
/** Back after this many days: start at 90% of the last load, and after the longer one at 80%. */
const SHORT_BREAK_DAYS = 14;
const LONG_BREAK_DAYS = 28;
const SHORT_BREAK_LOAD = 0.9;
const LONG_BREAK_LOAD = 0.8;
/** At this effort or harder a set was a grind; at the easier one it was easy. */
const GRIND_RPE = 9.5;
const EASY_RPE = 7;
/** At the cap, reps keep growing past the range's top up to this multiple of it, rounded. */
export const cappedRepCeiling = (maxReps: number) => Math.round(maxReps * 1.5);
const AT_CAP = 1e-4;

/** Kinds that progress against their own previous counterparts; the rest only show Previous. */
const PROGRESSING_KINDS: readonly SetKind[] = ["working", "top", "backoff"];
export const progresses = (kind: SetKind) => PROGRESSING_KINDS.includes(kind);

const done = (sets: readonly LoggedSet[]) => sets.filter((set) => set.completed_at !== null);

/**
 * The set of `sets` a planned set progresses from: the same kind at the same position, or the
 * last one of that kind when this Session had fewer. With none of that kind (a back-off set
 * where there was none) there is no base: a heavy working set must not seed a lighter back-off
 * set, so the explicit prescription stands.
 */
function counterpart(
  sets: readonly LoggedSet[],
  kind: SetKind,
  ordinal: number,
): LoggedSet | undefined {
  const same = sets.filter((set) => set.kind === kind);
  return same[Math.min(ordinal, same.length - 1)];
}

type Slot = { index: number; target: PlannedSet; ordinal: number };

/** The planned sets that progress, with their position among sets of their own kind. */
function slotsOf(planned: readonly PlannedSet[]): Slot[] {
  const seen = new Map<SetKind, number>();
  return planned.flatMap((target, index): Slot[] => {
    const ordinal = seen.get(target.kind) ?? 0;
    seen.set(target.kind, ordinal + 1);
    return progresses(target.kind) ? [{ index, target, ordinal }] : [];
  });
}

/** Whether the Session missed a planned range minimum at a grind (or with no effort logged). */
function missedRange(slots: readonly Slot[], sets: readonly LoggedSet[]): boolean {
  return slots.some(({ target, ordinal }) => {
    const set = counterpart(sets, target.kind, ordinal);
    return (
      target.reps_min !== undefined &&
      set?.reps != null &&
      set.reps < target.reps_min &&
      (set.rpe == null || set.rpe >= GRIND_RPE)
    );
  });
}

type Outcome =
  | "capped"
  | "add_weight"
  | "add_rep"
  | "cap_reps"
  | "cap_hint"
  | "hold"
  | "hold_effort"
  | "same";
const OUTCOME_ORDER = [
  "capped",
  "add_weight",
  "add_rep",
  "cap_reps",
  "hold_effort",
  "cap_hint",
  "hold",
  "same",
] as const;
const REASON_OF = {
  capped: "capped",
  cap_reps: "cap_reps",
  cap_hint: "cap_hint",
  add_weight: "add_weight",
  add_rep: "add_rep",
  hold_effort: "hold_effort",
  hold: "hold",
  same: "same_as_last",
} as const satisfies Record<Outcome, ProgressionReason>;

/**
 * Progression for planned sets (ADR 0038). `history` is newest first. Matched sets grow reps
 * to the top of their range, then add load and reset the reps. By default working sets wait
 * for every working set to reach the ceiling before adding load. Top and back-off sets progress
 * independently.
 * Logged effort tempers that (a grind holds, an easy set adds double), a miss of the range
 * minimum on two Sessions running holds, a break lowers the load and a Lighter week or the
 * stalled-lift deload suggests 90%. Warm-ups and Lighter-week Sessions are never a baseline.
 */
export function suggestNext(
  planned: readonly PlannedSet[],
  history: readonly ProgressionSession[],
  type: ExerciseType,
  equipment: Equipment,
  settings: IncrementSettings,
  context: ProgressionContext,
): Progression | null {
  const loaded = type === "weight_reps" || type === "bodyweight_weighted_reps";
  if (!loaded && type !== "reps_only" && type !== "bodyweight_reps") return null;
  const slots = slotsOf(planned);
  if (slots.length === 0) return null;
  const unit = settings.weightUnit;
  const grid = context.grid ?? null;
  const cap = loaded ? (grid?.capKg ?? null) : null;
  const baselines = outsideLighterWeeks(history, context.lighterWeeks ?? []).flatMap((session) => {
    const sets = done(session.sets).filter((set) => progresses(set.kind));
    return sets.length > 0 ? [{ ...session, sets }] : [];
  });
  const last = baselines[0];
  if (!last) return null;
  // The break clock runs from the latest Session with a completed working set; a Session of only
  // warm-ups or unticked sets is not training.
  const lastTrained =
    history.find((session) => done(session.sets).some((set) => progresses(set.kind))) ?? last;
  const breakDays = Math.floor(
    (context.now.getTime() - Date.parse(lastTrained.started_at)) / DAY_MS,
  );
  const breakLoad =
    breakDays >= LONG_BREAK_DAYS
      ? LONG_BREAK_LOAD
      : breakDays >= SHORT_BREAK_DAYS
        ? SHORT_BREAK_LOAD
        : null;
  const lighter =
    context.deload === true || activeLighterWeek(context.lighterWeeks ?? [], context.now) !== null;
  // The stricter of a break and a Lighter week wins; a Lighter week names itself on a tie.
  const factor = Math.min(
    lighter ? LIGHTER_WEEK_LOAD : 1,
    loaded && breakLoad !== null ? breakLoad : 1,
  );
  const resetReason: ProgressionReason | null =
    factor === 1
      ? null
      : loaded && breakLoad !== null && breakLoad < (lighter ? LIGHTER_WEEK_LOAD : 1)
        ? "after_break"
        : "deload";

  const sets: (SuggestedSet | null)[] = planned.map(() => null);
  if (resetReason !== null) {
    for (const { index, target, ordinal } of slots) {
      const before = counterpart(last.sets, target.kind, ordinal);
      if (!before) continue;
      const weightKg =
        before.weight_kg == null
          ? null
          : lightenLoad(before.weight_kg, factor, equipment, unit, grid);
      // A reset that cannot lower the load must not raise the reps either.
      const lowered = weightKg !== null && before.weight_kg != null && weightKg < before.weight_kg;
      const reset = target.reps_min ?? before.reps ?? null;
      sets[index] = {
        weightKg,
        reps:
          !lowered && reset !== null && before.reps != null ? Math.min(reset, before.reps) : reset,
      };
    }
    return {
      reason: resetReason,
      sets,
      incrementKg: incrementFor(null, equipment, settings, grid),
      breakDays: resetReason === "after_break" ? breakDays : null,
    };
  }

  const older = baselines[1];
  const held =
    older !== undefined && missedRange(slots, last.sets) && missedRange(slots, older.sets);
  // Without a weight to add, a rep range grows past its top only when every set topped it.
  const allTopped = slots.every(({ target, ordinal }) => {
    const before = counterpart(last.sets, target.kind, ordinal);
    return (
      target.reps_min !== undefined &&
      before?.reps != null &&
      before.reps >= (target.reps_max ?? target.reps_min)
    );
  });
  const lastWorking = last.sets.filter((set) => set.kind === "working");
  const workingReady = slots.every(({ target, ordinal }) => {
    if (target.kind !== "working") return true;
    const before = lastWorking[ordinal];
    const ceiling = target.reps_max ?? target.reps_min;
    return (
      ceiling !== undefined &&
      before?.reps != null &&
      before.reps >= ceiling &&
      before.weight_kg != null &&
      (before.rpe == null || before.rpe < GRIND_RPE)
    );
  });
  // Straight sets at one load share one increment: doubled only when every set there was easy.
  const easyLoads = new Map<number, boolean>();
  for (const set of lastWorking) {
    if (set.weight_kg == null) continue;
    const easy = set.rpe != null && set.rpe <= EASY_RPE;
    easyLoads.set(set.weight_kg, (easyLoads.get(set.weight_kg) ?? true) && easy);
  }
  const outcomes: Outcome[] = [];
  let incrementKg: number | null = null;
  for (const { index, target, ordinal } of slots) {
    const before = counterpart(last.sets, target.kind, ordinal);
    if (!before) continue;
    const same: SuggestedSet = { weightKg: before.weight_kg ?? null, reps: before.reps ?? null };
    let outcome: Outcome = "same";
    let next = same;
    if (cap !== null && before.weight_kg != null && before.weight_kg > cap + AT_CAP) {
      // Last time's load is more than this gym has: the cap is the most the lifter can load.
      outcome = "capped";
      next = { ...same, weightKg: cap };
    } else if (held) outcome = "hold";
    else if (before.rpe != null && before.rpe >= GRIND_RPE) outcome = "hold_effort";
    else if (target.reps_min !== undefined && before.reps != null) {
      const max = target.reps_max ?? target.reps_min;
      const canLoad = loaded && before.weight_kg != null;
      const atCap = cap !== null && before.weight_kg != null && before.weight_kg >= cap - AT_CAP;
      const extended = cappedRepCeiling(max);
      if (before.reps >= max && atCap) {
        // The load cannot rise: reps keep growing to the extended ceiling, then a hint.
        if (before.reps >= extended) outcome = "cap_hint";
        else {
          outcome = "cap_reps";
          next = { ...same, reps: before.reps + 1 };
        }
      } else if (before.reps >= max) {
        if (canLoad && (target.kind !== "working" || settings.progressionPerSet || workingReady)) {
          const easy =
            target.kind === "working" && !settings.progressionPerSet
              ? (easyLoads.get(before.weight_kg ?? 0) ?? false)
              : before.rpe != null && before.rpe <= EASY_RPE;
          const base = before.weight_kg ?? 0;
          const added = incrementFor(base, equipment, settings, grid) * (easy ? 2 : 1);
          const raised = addLoad(base, added, unit, grid);
          if (raised === null) outcome = "hold";
          else {
            incrementKg ??= raised - base;
            outcome = "add_weight";
            next = { weightKg: raised, reps: target.reps_min };
          }
        } else if (!canLoad) {
          outcome = "add_rep";
          next = { ...same, reps: allTopped ? before.reps + 1 : before.reps };
        } else {
          outcome = "hold";
        }
      } else {
        outcome = "add_rep";
        next = { ...same, reps: Math.min(max, before.reps + 1) };
      }
    }
    outcomes.push(outcome);
    sets[index] = next;
  }
  const top = OUTCOME_ORDER.find((outcome) => outcomes.includes(outcome)) ?? "same";
  return {
    reason: REASON_OF[top],
    sets,
    incrementKg:
      incrementKg ?? incrementFor(last.sets[0]?.weight_kg ?? null, equipment, settings, grid),
    breakDays: null,
  };
}
