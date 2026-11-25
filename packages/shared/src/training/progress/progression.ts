import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { isBaselinePhase, type Phase } from "../phases/phases";
import { weightAtMost } from "../vocabulary/format";
import { estimatedOneRepMax } from "../volume/volume";
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
  "reset",
  "hold_missed",
  "hold_together",
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

export type SetOutcome = {
  reason: ProgressionReason;
  changeKg?: number;
  limit?: "plates" | "equipment";
  /** The share of the previous load after snapping to the equipment. */
  loadFactor?: number;
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
  /**
   * The Sessions the loads and reps are read from, when fewer than the whole `history`: a
   * baseline can prefer the same Workout and, for gym-bound equipment, the same gym. The break
   * clock reads the exercise's full history across Workouts and gyms.
   */
  baselineHistory?: readonly ProgressionSession[];
  /** Every Lighter week, past and running. Their Sessions are never a baseline. */
  lighterWeeks?: readonly LighterPeriod[];
  /** Suggest the stalled-lift deload: 90% of the last load at the bottom of the range. */
  deload?: boolean;
  /**
   * The load factor of this week's phase (0.9 in a Deload): below 1 it suggests that share of the
   * last load at the bottom of the range, like the stalled-lift deload. Unlike a break, a Lighter
   * week or the stalled-lift deload, which round to the nearest load, a phase snaps down to the
   * grid: the greatest load at or below the product, as the Workout's own targets are lowered.
   */
  phaseLoad?: number;
  /** The loads this gym can make for the exercise, with its cap; null is the equipment default. */
  grid?: LoadGrid | null;
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
/** At this effort or harder a set was a grind; at the easier one it was easy. */
const GRIND_RPE = 9.5;
const EASY_RPE = 7;
/** At the cap, reps keep growing past the range's top up to this multiple of it, rounded. */
export const cappedRepCeiling = (maxReps: number) => Math.round(maxReps * 1.5);
const AT_CAP = 1e-4;

/** Kinds that progress against their own previous counterparts; the rest only show Previous. */
const SCALED_KINDS: readonly SetKind[] = ["drop", "failure", "myo"];
const PROGRESSING_KINDS: readonly SetKind[] = ["working", "top", "backoff"];
export const progresses = (kind: SetKind) => PROGRESSING_KINDS.includes(kind);

const done = (sets: readonly LoggedSet[]) => sets.filter((set) => set.completed_at !== null);

/**
 * The heaviest completed working set, in kilograms, of the latest baseline Session in `history`
 * (newest first, not a Test or Deload); null when there is none. What a Test week's top set
 * starts from.
 */
export function lastBaselineLoadKg(
  history: readonly Pick<ProgressionSession, "phase" | "sets">[],
): number | null {
  for (const session of history) {
    if (!isBaselinePhase(session.phase)) continue;
    const loads = done(session.sets).flatMap((set) =>
      progresses(set.kind) && set.weight_kg != null ? [set.weight_kg] : [],
    );
    if (loads.length > 0) return Math.max(...loads);
  }
  return null;
}

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

/** The actual set at each missed range minimum. New slots are not misses. */
function rangeMisses(slots: readonly Slot[], sets: readonly LoggedSet[]) {
  return slots.flatMap(({ target, ordinal, index }) => {
    const set = sets.filter(({ kind }) => kind === target.kind)[ordinal];
    return target.reps_min !== undefined &&
      set?.reps != null &&
      set.reps < target.reps_min &&
      (set.rpe == null || set.rpe >= GRIND_RPE)
      ? [{ index, set, minimum: target.reps_min, reps: set.reps }]
      : [];
  });
}

type Outcome =
  | "capped"
  | "add_weight"
  | "add_rep"
  | "cap_reps"
  | "cap_hint"
  | "reset"
  | "hold_missed"
  | "hold_together"
  | "hold_effort"
  | "same";
const OUTCOME_ORDER = [
  "capped",
  "reset",
  "add_weight",
  "add_rep",
  "cap_reps",
  "hold_effort",
  "cap_hint",
  "hold_missed",
  "hold_together",
  "same",
] as const;
const REASON_OF = {
  capped: "capped",
  cap_reps: "cap_reps",
  cap_hint: "cap_hint",
  add_weight: "add_weight",
  add_rep: "add_rep",
  hold_effort: "hold_effort",
  reset: "reset",
  hold_missed: "hold_missed",
  hold_together: "hold_together",
  same: "same_as_last",
} as const satisfies Record<Outcome, ProgressionReason>;

/**
 * Progression for planned sets (ADR 0038). `history` is newest first, all of it; the baselines
 * come from `context.baselineHistory` when given. Matched sets grow reps
 * to the top of their range, then add load and reset the reps. By default working sets wait
 * for every working set to reach the ceiling before adding load. Back-offs do the same within
 * their own group. Top sets progress independently.
 * Logged effort tempers that (a grind holds, an easy set adds double), a miss of the range
 * minimum on two Sessions running resets the load, a break lowers the load and a Lighter week or the
 * stalled-lift deload suggests 90%. Warm-ups, Lighter-week Sessions and Test or Deload phase
 * Sessions are never a baseline.
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
  const roundedCap = cap === null ? null : weightAtMost(cap, unit, cap);
  const baselines = outsideLighterWeeks(
    context.baselineHistory ?? history,
    context.lighterWeeks ?? [],
  ).flatMap((session) => {
    if (!isBaselinePhase(session.phase)) return [];
    const logged = done(session.sets);
    const sets = logged.filter((set) => progresses(set.kind));
    return sets.length > 0 ? [{ ...session, sets, logged }] : [];
  });
  const last = baselines[0];
  if (!last) return null;
  // The break clock runs from the latest Session with a completed working set, across all Workouts and gyms. A
  // Session of only warm-ups or unticked sets is not training.
  const lastTrained =
    history.find((session) => done(session.sets).some((set) => progresses(set.kind))) ?? last;
  const breakDays = Math.floor(
    (context.now.getTime() - Date.parse(lastTrained.started_at)) / DAY_MS,
  );
  const breakLoad =
    breakDays >= EXTENDED_BREAK_DAYS
      ? EXTENDED_BREAK_LOAD
      : breakDays >= LONG_BREAK_DAYS
        ? LONG_BREAK_LOAD
        : breakDays >= SHORT_BREAK_DAYS
          ? SHORT_BREAK_LOAD
          : null;
  const lighter =
    context.deload === true || activeLighterWeek(context.lighterWeeks ?? [], context.now) !== null;
  // A phase may ask for less than a Lighter week does (or for it alone): the lighter of them.
  const phaseFactor =
    context.phaseLoad !== undefined && context.phaseLoad < 1 ? context.phaseLoad : 1;
  const lightFactor = Math.min(lighter ? LIGHTER_WEEK_LOAD : 1, phaseFactor);
  // The stricter of a break and a Lighter week wins; a Lighter week names itself on a tie.
  const breakFactor = loaded || type === "bodyweight_reps" ? (breakLoad ?? 1) : 1;
  const factor = Math.min(lightFactor, breakFactor);
  const resetReason: ProgressionReason | null =
    factor === 1 ? null : breakFactor < lightFactor ? "after_break" : "deload";

  // The phase names the reset (and so rounds down) when its factor is the one in force.
  const phaseDecides =
    resetReason === "deload" && phaseFactor < 1 && Math.abs(factor - phaseFactor) < AT_CAP;
  const sets: (SuggestedSet | null)[] = planned.map(() => null);
  const outcomes: (SetOutcome | null)[] = planned.map(() => null);
  if (resetReason !== null) {
    const ordinals = new Map<SetKind, number>();
    for (const [index, target] of planned.entries()) {
      const ordinal = ordinals.get(target.kind) ?? 0;
      ordinals.set(target.kind, ordinal + 1);
      const progressing = progresses(target.kind);
      if (!progressing && (!loaded || !SCALED_KINDS.includes(target.kind))) continue;
      const before = progressing
        ? counterpart(last.sets, target.kind, ordinal)
        : last.logged.filter(({ kind }) => kind === target.kind)[ordinal];
      if (!before || (!progressing && before.weight_kg == null)) continue;
      const weightKg =
        before.weight_kg == null
          ? null
          : lightenLoad(
              before.weight_kg,
              factor,
              equipment,
              unit,
              grid,
              phaseDecides ? "down" : "nearest",
            );
      outcomes[index] = {
        reason: resetReason,
        loadFactor: weightKg !== null && before.weight_kg ? weightKg / before.weight_kg : undefined,
      };
      // A reset that cannot lower the load must not raise the reps either.
      const lowered = weightKg !== null && before.weight_kg != null && weightKg < before.weight_kg;
      const reset = target.reps_min ?? before.reps ?? null;
      sets[index] = {
        weightKg,
        reps: !progressing
          ? null
          : !lowered && reset !== null && before.reps != null
            ? Math.min(reset, before.reps)
            : reset,
      };
    }
    return {
      reason: resetReason,
      sets,
      outcomes,
      incrementKg: incrementFor(null, equipment, settings, grid),
      breakDays: resetReason === "after_break" ? breakDays : null,
    };
  }

  const older = baselines[1];
  const misses = rangeMisses(slots, last.sets);
  const held =
    misses.length > 0 && older !== undefined && rangeMisses(slots, older.sets).length > 0;
  const resets = new Map<number, number>();
  const together = (kind: SetKind) =>
    !settings.progressionPerSet && (kind === "working" || kind === "backoff");
  const groupKey = (kind: SetKind, weight: number) => `${kind}/${weight}`;
  const groupResets = new Map<string, number>();
  if (held && loaded) {
    for (const { index, set, minimum, reps } of misses) {
      const weight = set.weight_kg;
      const max = estimatedOneRepMax(weight ?? 0, reps);
      if (max === null || weight == null || minimum >= 37) continue;
      // Invert Brzycki at the target reps, then floor to a load that can be made.
      const ratio = (max * (37 - minimum)) / 36 / weight;
      const reset = lightenLoad(weight, ratio, equipment, unit, grid, "down");
      if (reset >= weight) continue;
      resets.set(index, reset);
      if (together(set.kind)) {
        const key = groupKey(set.kind, weight);
        groupResets.set(key, Math.min(reset, groupResets.get(key) ?? reset));
      }
    }
  }
  // Without a weight to add, a rep range grows past its top only when every set topped it.
  const allTopped = slots.every(({ target, ordinal }) => {
    const before = counterpart(last.sets, target.kind, ordinal);
    return (
      target.reps_min !== undefined &&
      before?.reps != null &&
      before.reps >= (target.reps_max ?? target.reps_min)
    );
  });
  const waiting = new Set<SetKind>();
  const easyLoads = new Map<string, boolean>();
  for (const kind of ["working", "backoff"] as const) {
    const previous = last.sets.filter((set) => set.kind === kind);
    for (const { target, ordinal } of slots) {
      if (target.kind !== kind) continue;
      const before = previous[ordinal];
      if (!before) continue;
      const ceiling = target.reps_max ?? target.reps_min;
      if (
        ceiling === undefined ||
        before.reps == null ||
        before.reps < ceiling ||
        before.weight_kg == null ||
        (before.rpe != null && before.rpe >= GRIND_RPE)
      )
        waiting.add(kind);
    }
    for (const set of previous) {
      if (set.weight_kg == null) continue;
      const key = groupKey(kind, set.weight_kg);
      const easy = set.rpe != null && set.rpe <= EASY_RPE;
      easyLoads.set(key, (easyLoads.get(key) ?? true) && easy);
    }
  }
  const ordered: Outcome[] = [];
  let incrementKg: number | null = null;
  for (const { index, target, ordinal } of slots) {
    const before = counterpart(last.sets, target.kind, ordinal);
    if (!before) continue;
    const same: SuggestedSet = { weightKg: before.weight_kg ?? null, reps: before.reps ?? null };
    const reset =
      together(target.kind) && same.weightKg !== null
        ? groupResets.get(groupKey(target.kind, same.weightKg))
        : resets.get(index);
    let outcome: Outcome = "same";
    let next = same;
    if (cap !== null && before.weight_kg != null && before.weight_kg > cap) {
      // Last time's load is more than this gym has: the cap is the most the lifter can load.
      outcome = "capped";
      next = { ...same, weightKg: cap };
    } else if (reset !== undefined && target.reps_min !== undefined) {
      outcome = "reset";
      next = { weightKg: reset, reps: target.reps_min };
    } else if (held) outcome = "hold_missed";
    else if (before.rpe != null && before.rpe >= GRIND_RPE) outcome = "hold_effort";
    else if (target.reps_min !== undefined && before.reps != null) {
      const max = target.reps_max ?? target.reps_min;
      const canLoad = loaded && before.weight_kg != null;
      const atCap =
        roundedCap !== null && before.weight_kg != null && before.weight_kg >= roundedCap - AT_CAP;
      const extended = cappedRepCeiling(max);
      if (before.reps >= max && atCap) {
        // The load cannot rise: reps keep growing to the extended ceiling, then a hint. Straight
        // working sets still move together: nothing grows until every set reached the ceiling.
        if (together(target.kind) && waiting.has(target.kind)) outcome = "hold_together";
        else if (before.reps >= extended) outcome = "cap_hint";
        else {
          outcome = "cap_reps";
          next = { ...same, reps: before.reps + 1 };
        }
      } else if (before.reps >= max) {
        if (canLoad && (!together(target.kind) || !waiting.has(target.kind))) {
          const easy = together(target.kind)
            ? (easyLoads.get(groupKey(target.kind, before.weight_kg ?? 0)) ?? false)
            : before.rpe != null && before.rpe <= EASY_RPE;
          const base = before.weight_kg ?? 0;
          const added = incrementFor(base, equipment, settings, grid) * (easy ? 2 : 1);
          const raised = addLoad(base, added, unit, grid);
          if (raised === null) {
            outcome = before.reps >= extended ? "cap_hint" : "cap_reps";
            if (outcome === "cap_reps") next = { ...same, reps: before.reps + 1 };
          } else {
            incrementKg ??= raised - base;
            outcome = "add_weight";
            next = { weightKg: raised, reps: target.reps_min };
          }
        } else if (!canLoad) {
          outcome = allTopped ? "add_rep" : "hold_together";
          next = { ...same, reps: allTopped ? before.reps + 1 : before.reps };
        } else {
          outcome = "hold_together";
        }
      } else {
        outcome = "add_rep";
        next = { ...same, reps: Math.min(max, before.reps + 1) };
      }
    }
    ordered.push(outcome);
    outcomes[index] = {
      reason: REASON_OF[outcome],
      limit:
        outcome === "capped" || outcome === "cap_hint" || outcome === "cap_reps"
          ? grid?.source === "kit"
            ? "plates"
            : "equipment"
          : undefined,
      changeKg:
        outcome === "add_weight"
          ? (next.weightKg ?? 0) - (before.weight_kg ?? 0)
          : outcome === "capped"
            ? (next.weightKg ?? undefined)
            : undefined,
    };
    sets[index] = next;
  }
  const top = OUTCOME_ORDER.find((outcome) => ordered.includes(outcome)) ?? "same";
  return {
    reason: REASON_OF[top],
    sets,
    outcomes,
    incrementKg:
      incrementKg ?? incrementFor(last.sets[0]?.weight_kg ?? null, equipment, settings, grid),
    breakDays: null,
  };
}
