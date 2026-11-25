import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { PlannedSet } from "../plans/planned-sets";
import { applyPhase, hasLoad, type Phase, type PhaseNow } from "../phases/phases";
import type { LoadGrid } from "../progress/load-grid";
import { resolveExerciseUnit, type WeightUnit } from "../vocabulary/vocabulary";

/** What a surface knows about the entry whose targets a phase adjusts. */
export type PhaseTargetEntry = {
  isMainLift: boolean;
  type: ExerciseType;
  equipment: Equipment;
  /** The account's weight unit and the exercise's own, when it overrides it. */
  accountUnit: WeightUnit;
  unitOverride?: WeightUnit | null;
  grid: LoadGrid | null;
};

/** Whether the phase asks for a Test single, which needs a load seeded from the lifter's history. */
export const needsTestSeed = (
  week: Pick<PhaseNow, "phase">,
  entry: Pick<PhaseTargetEntry, "isMainLift" | "type">,
) => week.phase === "test" && entry.isMainLift && hasLoad(entry.type);

/**
 * The targets of an entry as a Run week's phase makes them, the same call when the Session starts
 * and when the Workout is previewed. `testLoadKg` is the Test seed ({@link testWorkingLoad}),
 * which the caller reads from its own transaction or history; null when none applies.
 */
export function phaseTargets(
  sets: readonly PlannedSet[],
  week: Pick<PhaseNow, "modifiers" | "testTop" | "testWorkups"> & { phase: Phase },
  entry: PhaseTargetEntry,
  testLoadKg: number | null,
): PlannedSet[] {
  return applyPhase(sets, week.phase, {
    isMainLift: entry.isMainLift,
    type: entry.type,
    equipment: entry.equipment,
    unit: resolveExerciseUnit(entry.accountUnit, entry.unitOverride),
    grid: entry.grid,
    modifiers: week.modifiers,
    testTop: week.testTop,
    testWorkups: week.testWorkups,
    testLoadKg,
  });
}
