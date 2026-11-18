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
  /** Counted sets per week that feed the axis. */
  sets: number;
  /** The sum of the weekly minimums of the axis' targeted muscles; null when none has a target. */
  target: number | null;
};

/**
 * The six radar axes from a week's loads and rows. `divisor` turns a total over several weeks into
 * a weekly average. An axis has a target only when one of its muscles has a range; the target is
 * the sum of those ranges' minimums, so reaching it means every targeted muscle is at least on target.
 */
export function muscleRadarAxes(
  loads: readonly MuscleLoad[],
  rows: readonly MuscleRow[],
  divisor = 1,
): MuscleRadarAxis[] {
  const sets = new Map<RadarAxisKey, number>();
  for (const load of loads) {
    const axis = radarAxisOf(load.muscle);
    if (axis !== null) sets.set(axis, (sets.get(axis) ?? 0) + load.sets / divisor);
  }
  const targets = new Map<RadarAxisKey, number>();
  for (const row of rows) {
    const axis = radarAxisOf(row.muscle);
    if (axis !== null && row.range !== null) {
      targets.set(axis, (targets.get(axis) ?? 0) + row.range.min);
    }
  }
  return RADAR_AXES.map((key) => ({
    key,
    sets: sets.get(key) ?? 0,
    target: targets.get(key) ?? null,
  }));
}
