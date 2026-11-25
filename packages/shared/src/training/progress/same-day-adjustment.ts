import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import { loadIdentity, weightAtMost } from "../vocabulary/format";
import { MAX_WEIGHT_KG, resolveExerciseUnit, type WeightUnit } from "../vocabulary/vocabulary";
import { alignToGrid, gridFloor, type LoadGrid } from "./load-grid";
import type { Prescription, PrescribedSet } from "./prescription";
import { incrementFor, incrementInUnit, loadable } from "./progression-steps";

export type AdjustmentLoads = {
  equipment: Equipment;
  type: ExerciseType;
  unit: WeightUnit;
  grid: LoadGrid | null;
  /** The lifter's own step, when they set one: the same one the next suggestion uses. */
  weightIncrementKg: number | null;
};

/** The loads of one exercise as the suggestion read them: the lifter's unit, step and the gym grid. */
export function adjustmentLoadsFor(
  exercise: { equipment: Equipment; type: ExerciseType; unit?: WeightUnit | null },
  account: {
    unit: WeightUnit;
    weightIncrementKg: number | null;
    weightIncrementUnit?: WeightUnit | null;
  },
  grid: LoadGrid | null,
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
  };
}

/** What was logged on the set; any number of effort is read, only the target was on the scale. */
type Actual = { reps?: number | null; rpe?: number | null };

function deviation(ghosts: PrescribedSet["ghosts"], { reps, rpe }: Actual) {
  const repDelta = reps != null && ghosts.reps != null ? reps - ghosts.reps : 0;
  const effortDelta = rpe != null && ghosts.rpe != null ? rpe - ghosts.rpe : 0;
  // If the signals disagree, a clear miss takes precedence over an increase.
  if (repDelta <= -2) return "reps_short";
  if (effortDelta >= 1.5) return "effort_high";
  if (repDelta >= 2) return "reps_over";
  if (effortDelta <= -1.5) return "effort_low";
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

/** Adjusts only the still-unticked targets. The trigger can be used at most once. */
export function adjustPrescription(
  snapshot: Prescription,
  setId: string,
  actual: Actual,
  unticked: ReadonlySet<string>,
  loads: AdjustmentLoads,
  canIncrease: boolean,
): Prescription | null {
  if (snapshot.adjustmentUndone || snapshot.adjustedBy?.includes(setId)) return null;
  const target = snapshot.sets.find(({ id }) => id === setId);
  if (!target) return null;
  const reason = deviation(target.ghosts, actual);
  if (!reason) return null;
  const lighter = reason === "reps_short" || reason === "effort_high";
  if (
    !lighter &&
    (!canIncrease || snapshot.reason === "deload" || snapshot.reason === "after_break")
  )
    return null;
  const cap = Math.min(snapshot.capKg ?? MAX_WEIGHT_KG, loads.grid?.capKg ?? MAX_WEIGHT_KG);
  let changed = false;
  const sets = snapshot.sets.map((set) => {
    const weight = set.ghosts.weight;
    if (set.id === setId || !unticked.has(set.id) || weight == null) return set;
    const adjusted = stepLoad(weight, lighter, cap, loads);
    if (adjusted === weight) return set;
    changed = true;
    return {
      ...set,
      ghosts: { ...set.ghosts, weight: adjusted },
      unadjustedWeightKg: set.unadjustedWeightKg ?? weight,
    };
  });
  if (!changed) return null;
  return {
    ...snapshot,
    sets,
    adjustedBy: [...(snapshot.adjustedBy ?? []), setId],
    adjustment: {
      setId,
      reason,
      reps: Math.abs((actual.reps ?? 0) - (target.ghosts.reps ?? 0)),
    },
  };
}

export function undoPrescriptionAdjustment(
  snapshot: Prescription,
  unticked: ReadonlySet<string>,
): Prescription | null {
  if (!snapshot.adjustment || snapshot.adjustmentUndone) return null;
  return {
    ...snapshot,
    adjustmentUndone: true,
    adjustment: undefined,
    sets: snapshot.sets.map((set) => {
      if (set.unadjustedWeightKg === undefined || !unticked.has(set.id)) return set;
      const { unadjustedWeightKg, ...original } = set;
      return { ...original, ghosts: { ...original.ghosts, weight: unadjustedWeightKg } };
    }),
  };
}
