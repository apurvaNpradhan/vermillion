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
    "kind" | "completed_at" | "weight_kg" | "reps" | "rpe" | "bodyweight_kg"
  >[];
};

/** Midpoint of the prescribed 90–95% range. */
const TEST_SHARE = 0.925;
const RECENT_BASELINES = 3;
const RECENT_MS = 56 * 86_400_000;

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
  // The bodyweight the estimate was made with, for when today's is not known.
  let estimateBodyweight: number | null = null;
  let loggedLoad: number | null = null;
  let baselines = 0;
  for (const session of outsideLighterWeeks(before, options.lighterWeeks ?? [])) {
    if (session.phase === "test" || session.phase === "deload") continue;
    baselines += 1;
    const recent =
      options.single &&
      baselines <= RECENT_BASELINES &&
      options.now.getTime() - Date.parse(session.started_at) <= RECENT_MS;
    let result: number | null = null;
    let resultBodyweight: number | null = null;
    let workingLoad: number | null = null;
    for (const set of session.sets) {
      if (set.completed_at === null || !progresses(set.kind) || set.weight_kg == null) continue;
      workingLoad = Math.max(workingLoad ?? 0, set.weight_kg);
      if (!recent || set.reps == null) continue;
      const bodyweight = set.bodyweight_kg === undefined ? options.bodyweightKg : set.bodyweight_kg;
      const weight = effectiveWeight(type, set.weight_kg, bodyweight);
      const max = weight === null ? null : estimatedOneRepMax(weight, set.reps, set.rpe);
      if (max !== null && max > (result ?? 0)) {
        result = max;
        resultBodyweight = bodyweight ?? null;
      }
    }
    loggedLoad ??= workingLoad;
    if (result !== null) {
      estimate = result;
      estimateBodyweight = resultBodyweight;
      break;
    }
    if (!recent && loggedLoad !== null) break;
  }
  const { load: factor } = trainingBreak(before, options.now);
  if (estimate === null) return loggedLoad === null ? null : loggedLoad * factor;
  // The belt carries the estimate less the body: today's weight, else the one the set was done at.
  const offset =
    type === "bodyweight_weighted_reps" ? (options.bodyweightKg ?? estimateBodyweight ?? 0) : 0;
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
