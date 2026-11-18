import type { MuscleGroup, MuscleLoad, MuscleRow } from "@workspace/shared";

/** The six axes of the muscle radar, in the order they go round. */
export const RADAR_AXES = ["push", "pull", "legs", "core", "shoulders", "arms"] as const;
export type RadarAxisKey = (typeof RADAR_AXES)[number];

/** Which axis each muscle group feeds. Cardio, full body, neck and other feed none. */
const AXIS_OF: Partial<Record<MuscleGroup, RadarAxisKey>> = {
  chest: "push",
  lats: "pull",
  upper_back: "pull",
  traps: "pull",
  quadriceps: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  abductors: "legs",
  adductors: "legs",
  abdominals: "core",
  lower_back: "core",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
};

export const radarAxisOf = (muscle: MuscleGroup): RadarAxisKey | null => AXIS_OF[muscle] ?? null;

export type MuscleRadarAxis = {
  key: RadarAxisKey;
  /** Weighted sets a week that feed the axis, from every muscle (1 for primary, ½ for secondary). */
  sets: number;
  /** The same weighting over only the axis' muscles that have a target. */
  targetedSets: number;
  /** The sum of the weekly minimums of the axis' targeted muscles; null when none has a target. */
  target: number | null;
};

/**
 * The six radar axes from a week's loads and rows. `divisor` turns a total over several weeks into
 * a weekly average. An axis has a target only when one of its muscles has a range, and the target
 * is the sum of those ranges' minimums. `targetedSets` adds up the loads of those same muscles, so
 * `targetedSets` against `target` compares like with like; `sets` is the axis' whole weighted
 * volume. `radarValue` picks the one the chart draws.
 */
export function muscleRadarAxes(
  loads: readonly MuscleLoad[],
  rows: readonly MuscleRow[],
  divisor = 1,
): MuscleRadarAxis[] {
  const targeted = new Map<MuscleGroup, number>();
  for (const row of rows) if (row.range !== null) targeted.set(row.muscle, row.range.min);
  const sets = new Map<RadarAxisKey, number>();
  const targetedSets = new Map<RadarAxisKey, number>();
  for (const load of loads) {
    const axis = radarAxisOf(load.muscle);
    if (axis === null) continue;
    const weekly = load.sets / divisor;
    sets.set(axis, (sets.get(axis) ?? 0) + weekly);
    if (targeted.has(load.muscle)) targetedSets.set(axis, (targetedSets.get(axis) ?? 0) + weekly);
  }
  const targets = new Map<RadarAxisKey, number>();
  for (const [muscle, min] of targeted) {
    const axis = radarAxisOf(muscle);
    if (axis !== null) targets.set(axis, (targets.get(axis) ?? 0) + min);
  }
  return RADAR_AXES.map((key) => ({
    key,
    sets: sets.get(key) ?? 0,
    targetedSets: targetedSets.get(key) ?? 0,
    target: targets.get(key) ?? null,
  }));
}

/**
 * What the radar draws on an axis: with a target, the targeted muscles' sets (compared with their
 * minimums); without one, the axis' whole weighted volume.
 */
export const radarValue = (axis: MuscleRadarAxis) =>
  axis.target === null ? axis.sets : axis.targetedSets;
