import {
  GOAL_RANGES,
  type MuscleGroup,
  type MuscleLoad,
  type MuscleRow,
  type SetRange,
} from "@workspace/shared";

/** The bar leaves a quarter of room past the range's top, so a muscle just above it is visible. */
const HEADROOM = 1.25;

/**
 * Where a muscle's bar draws, as fractions of the track (0 to 1): the filled value and the quiet
 * band of its range. The track is as long as the biggest of the range's top plus headroom and
 * the sets, so a muscle far above its range still fits.
 */
export function barLayout(sets: number, range: SetRange) {
  const scale = Math.max(range.max * HEADROOM, sets, 1);
  return { fill: sets / scale, bandStart: range.min / scale, bandEnd: range.max / scale };
}

/** The faintest tint the body map shows for a muscle that has any sets. */
const MIN_TINT = 0.2;

/**
 * How strongly the body map shades each muscle: its sets against the top of its range (a muscle
 * with no target counts against the Grow range), so a full tint means at the top of the range.
 */
export function bodyIntensity(
  loads: readonly MuscleLoad[],
  rows: readonly MuscleRow[],
): Map<MuscleGroup, number> {
  const tops = new Map<MuscleGroup, number>(rows.map((row) => [row.muscle, row.range.max]));
  const intensity = new Map<MuscleGroup, number>();
  for (const load of loads) {
    if (load.sets <= 0) continue;
    const top = tops.get(load.muscle) ?? GOAL_RANGES.grow.max;
    intensity.set(load.muscle, Math.min(1, Math.max(MIN_TINT, load.sets / top)));
  }
  return intensity;
}

/** The "9 of 10–20" figures of a row: sets with at most one decimal, and the range. */
export function formatSets(sets: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(sets);
}
