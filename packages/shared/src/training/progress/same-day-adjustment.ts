import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import { loadIdentity, weightAtMost } from "../vocabulary/format";
import {
  MAX_WEIGHT_KG,
  resolveExerciseUnit,
  type SetKind,
  type WeightUnit,
} from "../vocabulary/vocabulary";
import { alignToGrid, gridFloor, type LoadGrid } from "./load-grid";
import { activeLighterWeek, type LighterPeriod } from "./lighter-week";
import type { Adjustment, Prescription, PrescribedSet } from "./prescription";
import { progresses } from "./progression";
import { incrementFor, incrementInUnit, loadable } from "./progression-steps";
import { repsAtLoad } from "./suggestion-ledger";

export type AdjustmentLoads = {
  equipment: Equipment;
  type: ExerciseType;
  unit: WeightUnit;
  grid: LoadGrid | null;
  /** The lifter's own step, when they set one: the same one the next suggestion uses. */
  weightIncrementKg: number | null;
  /** A Lighter week is running: like a Deload, it never raises a load. */
  lighter?: boolean;
};

/** The loads of one exercise as the suggestion read them: the lifter's unit, step and the gym grid. */
export function adjustmentLoadsFor(
  exercise: { equipment: Equipment; type: ExerciseType; unit?: WeightUnit | null },
  account: {
    unit: WeightUnit;
    weightIncrementKg: number | null;
    weightIncrementUnit?: WeightUnit | null;
    lighterWeeks?: readonly LighterPeriod[];
  },
  grid: LoadGrid | null,
  now: Date = new Date(),
): AdjustmentLoads {
  const unit = resolveExerciseUnit(account.unit, exercise.unit);
  return {
    equipment: exercise.equipment,
    type: exercise.type,
    unit,
    grid,
    weightIncrementKg: incrementInUnit(
      account.weightIncrementKg,
      account.weightIncrementUnit ?? account.unit,
      unit,
    ),
    lighter: activeLighterWeek(account.lighterWeeks ?? [], now) !== null,
  };
}

/** What was logged on the set; any number of effort is read, only the target was on the scale. */
export type Actual = {
  kind: SetKind;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
};

/** Reps (or reps in reserve) the set is off by before the targets of the others move. */
const REPS_GAP = 2;
const EFFORT_GAP = 1.5;
/** With reps and effort together, how many reps of capacity the set is off by. */
const CAPACITY_GAP = 1.5;
const EPSILON = 1e-6;

type Verdict = Pick<Adjustment, "reason" | "reps">;

/**
 * How a set went against its target. At the load that was suggested, reps and effort are read
 * together as capacity (reps plus the reps left in reserve, 10 − RPE), so fewer reps at an easier
 * effort is not a miss; with only one of them logged, that one is read. At another load the set
 * is converted to the reps it is worth at the suggested load by estimated 1RM, and effort is not
 * read (it was said about a different weight): 110 × 6 against 100 × 8 moves nothing.
 */
export function deviation(ghosts: PrescribedSet["ghosts"], actual: Actual): Verdict | null {
  const { weight: suggestedKg, reps: targetReps, rpe: targetRpe } = ghosts;
  const { weight_kg: loggedKg, reps, rpe } = actual;
  const other =
    suggestedKg != null && loggedKg != null && loadIdentity(loggedKg) !== loadIdentity(suggestedKg);
  if (other) {
    if (targetReps == null || reps == null) return null;
    const worth = repsAtLoad({ weight_kg: loggedKg, reps, rpe }, suggestedKg);
    if (worth === null) return null;
    const gap = worth - targetReps;
    if (gap <= -REPS_GAP + EPSILON) return { reason: "reps_short", reps: Math.round(-gap) };
    if (gap >= REPS_GAP - EPSILON) return { reason: "reps_over", reps: Math.round(gap) };
    return null;
  }
  const repDelta = reps != null && targetReps != null ? reps - targetReps : null;
  const effortDelta = rpe != null && targetRpe != null ? rpe - targetRpe : null;
  const magnitude = Math.abs(repDelta ?? 0);
  if (repDelta !== null && effortDelta !== null) {
    // Capacity moves with reps and against effort: one rep more is one more rep of capacity.
    const capacity = repDelta - effortDelta;
    if (capacity <= -CAPACITY_GAP)
      return { reason: repDelta < 0 ? "reps_short" : "effort_high", reps: magnitude };
    if (capacity >= CAPACITY_GAP)
      return { reason: repDelta > 0 ? "reps_over" : "effort_low", reps: magnitude };
    return null;
  }
  if (repDelta !== null) {
    if (repDelta <= -REPS_GAP) return { reason: "reps_short", reps: magnitude };
    if (repDelta >= REPS_GAP) return { reason: "reps_over", reps: magnitude };
  }
  if (effortDelta !== null) {
    if (effortDelta >= EFFORT_GAP) return { reason: "effort_high", reps: 0 };
    if (effortDelta <= -EFFORT_GAP) return { reason: "effort_low", reps: 0 };
  }
  return null;
}

/** One physical step from the offered weight, with the original and current caps respected. */
function stepLoad(
  weight: number,
  lighter: boolean,
  cap: number,
  { equipment, type, unit, grid, weightIncrementKg }: AdjustmentLoads,
) {
  const physical = grid && grid.source !== "cap" ? grid : null;
  const start = physical ? alignToGrid(physical, weight) : weight;
  const step = incrementFor(
    weight,
    equipment,
    { weightUnit: unit, weightIncrementKg, exerciseType: type },
    grid,
  );
  let next: number | null;
  if (physical) {
    next = physical.nearest(start + (lighter ? -step : step));
    // A step smaller than the grid's still moves one point.
    if (
      lighter
        ? loadIdentity(next) >= loadIdentity(start)
        : loadIdentity(next) <= loadIdentity(start)
    )
      next = lighter ? physical.below(start) : physical.above(start);
  } else {
    next = Math.max(0, start + (lighter ? -step : step));
  }
  if (next === null) return weight;
  const capped = next > cap && physical ? gridFloor(physical, cap) : Math.min(next, cap);
  if (capped > cap) return weight;
  const typed = loadable(capped, unit);
  const candidate = typed <= cap ? typed : weightAtMost(capped, unit, cap);
  const change = loadIdentity(candidate) - loadIdentity(weight);
  return (lighter ? change < 0 : change > 0) ? candidate : weight;
}

/**
 * Adjusts only the still-unticked sets that progress (never a warm-up, drop, myo or failure set):
 * a miss by a working, top or back-off set lowers the rest of them, a top set's back-offs
 * included. A trigger set adjusts once, and each adjustment records what it moved so it can be
 * undone on its own. `unticked` names the open sets and their kinds.
 */
export function adjustPrescription(
  snapshot: Prescription,
  setId: string,
  actual: Actual,
  unticked: ReadonlyMap<string, SetKind>,
  loads: AdjustmentLoads,
  canIncrease: boolean,
): Prescription | null {
  if (
    snapshot.adjustmentUndone ||
    !progresses(actual.kind) ||
    snapshot.adjustments?.some((adjustment) => adjustment.setId === setId)
  )
    return null;
  const target = snapshot.sets.find(({ id }) => id === setId);
  if (!target) return null;
  const verdict = deviation(target.ghosts, actual);
  if (!verdict) return null;
  const lighter = verdict.reason === "reps_short" || verdict.reason === "effort_high";
  if (
    !lighter &&
    (!canIncrease ||
      loads.lighter === true ||
      snapshot.reason === "deload" ||
      snapshot.reason === "after_break")
  )
    return null;
  const cap = Math.min(snapshot.capKg ?? MAX_WEIGHT_KG, loads.grid?.capKg ?? MAX_WEIGHT_KG);
  const moved: Adjustment["moved"] = [];
  const sets = snapshot.sets.map((set) => {
    const weight = set.ghosts.weight;
    const kind = unticked.get(set.id);
    if (set.id === setId || kind === undefined || !progresses(kind) || weight == null) return set;
    const adjusted = stepLoad(weight, lighter, cap, loads);
    if (adjusted === weight) return set;
    moved.push({ id: set.id, fromKg: weight });
    return {
      ...set,
      ghosts: { ...set.ghosts, weight: adjusted },
      unadjustedWeightKg: set.unadjustedWeightKg ?? weight,
    };
  });
  if (moved.length === 0) return null;
  return {
    ...snapshot,
    sets,
    adjustments: [...(snapshot.adjustments ?? []), { setId, ...verdict, moved }],
  };
}

/** Takes back every adjustment from index `keep` on: the still-unticked sets they moved get their loads. */
function takeBack(snapshot: Prescription, keep: number, unticked: ReadonlySet<string>) {
  const stack = snapshot.adjustments ?? [];
  const remaining = stack.slice(0, keep);
  const restored = new Map<string, number>();
  // Newest first, so a set moved twice ends on the load it had before the older one.
  for (const adjustment of stack.slice(keep).reverse()) {
    for (const { id, fromKg } of adjustment.moved) if (unticked.has(id)) restored.set(id, fromKg);
  }
  const sets = snapshot.sets.map((set) => {
    const fromKg = restored.get(set.id);
    if (fromKg === undefined) return set;
    const { unadjustedWeightKg, ...rest } = set;
    const stillMoved = remaining.some(({ moved }) => moved.some(({ id }) => id === set.id));
    return {
      ...rest,
      ghosts: { ...rest.ghosts, weight: fromKg },
      ...(stillMoved && unadjustedWeightKg !== undefined ? { unadjustedWeightKg } : {}),
    };
  });
  return { ...snapshot, sets, adjustments: remaining.length > 0 ? remaining : undefined };
}

/**
 * The Undo button: takes back the newest adjustment, restores the still-unticked sets it moved
 * and stops the exercise adjusting for the rest of the Session. Null when there is none.
 */
export function undoPrescriptionAdjustment(
  snapshot: Prescription,
  unticked: ReadonlySet<string>,
): Prescription | null {
  const stack = snapshot.adjustments ?? [];
  if (stack.length === 0) return null;
  return { ...takeBack(snapshot, stack.length - 1, unticked), adjustmentUndone: true };
}

/**
 * The trigger set was unticked or corrected, so what it moved no longer follows from it: takes
 * its adjustment back (and any made after it, which were built on its loads), restoring the sets
 * that are still unticked. The exercise may adjust again when the set is ticked. Null when the set
 * triggered nothing.
 */
export function revertPrescriptionAdjustment(
  snapshot: Prescription,
  triggerId: string,
  unticked: ReadonlySet<string>,
): Prescription | null {
  const at = snapshot.adjustments?.findIndex(({ setId }) => setId === triggerId) ?? -1;
  return at < 0 ? null : takeBack(snapshot, at, unticked);
}
