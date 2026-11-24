import type { BodyGroup, BodyView } from "@/body-map";
import type { MuscleRow, TargetMuscle } from "@workspace/shared";

/**
 * How the muscle list is grouped: each region names its muscles, and its icon highlights the ones
 * that read as the region on the drawn body (Push: chest, front delts, triceps).
 */
export const MUSCLE_REGIONS = [
  {
    key: "push",
    view: "front",
    icon: ["chest", "shoulders", "triceps"],
    muscles: ["chest", "shoulders", "triceps"],
  },
  {
    key: "pull",
    view: "back",
    icon: ["lats", "upper_back", "traps", "biceps"],
    muscles: ["lats", "upper_back", "traps", "biceps"],
  },
  {
    key: "legs",
    view: "front",
    icon: ["quadriceps", "adductors", "calves"],
    muscles: ["quadriceps", "hamstrings", "glutes", "calves"],
  },
  {
    key: "core",
    view: "front",
    icon: ["abdominals"],
    muscles: ["abdominals"],
  },
] as const satisfies readonly {
  key: string;
  view: BodyView;
  icon: readonly BodyGroup[];
  muscles: readonly TargetMuscle[];
}[];

export type RegionKey = (typeof MUSCLE_REGIONS)[number]["key"];

/**
 * The rows split by region in the order above, each region keeping its rows' order. Empty regions
 * are left out. Every targeted muscle belongs to exactly one region (the tests check it).
 */
export function regionRows<Row extends Pick<MuscleRow, "muscle">>(
  rows: readonly Row[],
): { key: RegionKey; rows: Row[] }[] {
  return MUSCLE_REGIONS.flatMap((region) => {
    const own: readonly TargetMuscle[] = region.muscles;
    const inRegion = rows.filter((row) => own.includes(row.muscle));
    return inRegion.length > 0 ? [{ key: region.key, rows: inRegion }] : [];
  });
}
