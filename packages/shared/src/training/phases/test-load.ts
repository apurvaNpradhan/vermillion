import type { ExerciseType } from "../../exercise/vocabulary";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { outsideLighterWeeks, type LighterPeriod } from "../progress/lighter-week";
import { progresses, trainingBreak } from "../progress/progression";
import { effectiveWeight, estimatedOneRepMax } from "../volume/volume";
import type { Phase } from "./phases";

type TestHistory = {
  started_at: string;
  phase?: Phase | null;
  sets: readonly Pick<
    LoggedSet,
    "kind" | "completed_at" | "weight_kg" | "reps" | "bodyweight_kg"
  >[];
};

/** Midpoint of the prescribed 90–95% range. Tests can raise the estimate for a subsequent Test. */
const TEST_SHARE = 0.925;

export function testWorkingLoad(
  history: readonly TestHistory[],
  type: ExerciseType,
  options: {
    now: Date;
    bodyweightKg?: number | null;
    lighterWeeks?: readonly LighterPeriod[];
    single: boolean;
  },
): number | null {
  const before = history.filter(
    (session) => Date.parse(session.started_at) <= options.now.getTime(),
  );
  let estimate: number | null = null;
  let loggedLoad: number | null = null;
  for (const session of outsideLighterWeeks(before, options.lighterWeeks ?? [])) {
    if (session.phase === "deload") continue;
    let result: number | null = null;
    for (const set of session.sets) {
      if (set.completed_at === null || !progresses(set.kind) || set.weight_kg == null) continue;
      if (session.phase !== "test") loggedLoad = Math.max(loggedLoad ?? 0, set.weight_kg);
      if (set.reps == null || !options.single) continue;
      const bodyweight = set.bodyweight_kg === undefined ? options.bodyweightKg : set.bodyweight_kg;
      const weight = effectiveWeight(type, set.weight_kg, bodyweight);
      const max = weight === null ? null : estimatedOneRepMax(weight, set.reps);
      if (max !== null) result = Math.max(result ?? 0, max);
    }
    if (result !== null) estimate = Math.max(estimate ?? 0, result);
    if (session.phase !== "test" && (options.single ? result !== null : loggedLoad !== null)) break;
  }
  const { load: factor } = trainingBreak(before, options.now);
  if (estimate === null) return loggedLoad === null ? null : loggedLoad * factor;
  const offset = type === "bodyweight_weighted_reps" ? (options.bodyweightKg ?? 0) : 0;
  return Math.max(0, estimate * TEST_SHARE * factor - offset);
}

/** Only the Test's new main lift uses the Test prescription. Accessories still progress normally. */
export function isTestSingle(
  phase: Phase | null | undefined,
  sets: readonly (PlannedSet | null)[],
): boolean {
  return (
    phase === "test" &&
    sets.some(
      (set) =>
        set?.kind === "top" &&
        set.reps_min === 1 &&
        set.reps_max === 1 &&
        set.effort_min === 8 &&
        set.effort_max === 9,
    )
  );
}
