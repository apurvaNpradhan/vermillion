import { latestOnOrBefore, trendAt, type TrendPoint } from "@workspace/shared";

type Dated = { local_date: string; measured_at: string; value: number };

/** What sits under one side of Compare: the weight trend and the waist on its date, in kg and cm. */
export type SideStats = { weightKg: number | null; waistCm: number | null };

/**
 * The weight trend on a date and the latest waist on or before it. A date with no weigh-in still
 * has a trend (it is interpolated); a date before the first one has none.
 */
export function sideStats(
  date: string,
  trend: readonly TrendPoint[],
  waist: readonly Dated[],
): SideStats {
  return {
    weightKg: trendAt(trend, date),
    waistCm: latestOnOrBefore(waist, date)?.value ?? null,
  };
}

/** What changed between the two sides; null where either side has no value. */
export function statsChange(before: SideStats, after: SideStats): SideStats {
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);
  return {
    weightKg: diff(before.weightKg, after.weightKg),
    waistCm: diff(before.waistCm, after.waistCm),
  };
}
