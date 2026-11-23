import {
  type MuscleGroup,
  type MuscleLoad,
  type MuscleRow,
  type SetRange,
} from "@workspace/shared";

/** The bar leaves a quarter of room past the range's top, so a muscle just above it is visible. */
const HEADROOM = 1.25;

/**
 * Where a muscle's bar draws, as fractions of the track (0 to 1): the filled value, the quiet
 * band of its range and the marker of its four-week average. The track is as long as the biggest
 * of the range's top plus headroom, the sets and the average, so a muscle far above its range
 * still fits.
 */
export function barLayout(sets: number, range: SetRange | null, peak = sets, average = 0) {
  const scale = Math.max((range?.max ?? peak) * HEADROOM, sets, average, 1);
  return {
    fill: sets / scale,
    bandStart: (range?.min ?? 0) / scale,
    bandEnd: (range?.max ?? 0) / scale,
    average: average / scale,
  };
}

/** The faintest tint the body map shows for a muscle that has any sets. */
const MIN_TINT = 0.2;

/**
 * Shade by progress toward the target, or by relative volume for muscles without a target.
 */
export function bodyIntensity(
  loads: readonly MuscleLoad[],
  rows: readonly MuscleRow[],
): Map<MuscleGroup, number> {
  const tops = new Map<MuscleGroup, number | undefined>(
    rows.map((row) => [row.muscle, row.range?.max]),
  );
  const peak = Math.max(1, ...loads.map((load) => load.sets));
  const intensity = new Map<MuscleGroup, number>();
  for (const load of loads) {
    if (load.sets <= 0) continue;
    const top = tops.get(load.muscle) ?? peak;
    intensity.set(load.muscle, Math.min(1, Math.max(MIN_TINT, load.sets / top)));
  }
  return intensity;
}

/** The "9 of 10–20" figures of a row: sets with at most one decimal, and the range. */
export function formatSets(sets: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(sets);
}
