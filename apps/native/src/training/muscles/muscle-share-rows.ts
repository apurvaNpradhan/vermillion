import { type MuscleDetail, type MuscleGroup, type MuscleShares } from "@workspace/shared";

/** A bar of the distribution list. `detail` is set on a detail row, which also names its group. */
export type ShareRow = {
  key: string;
  muscle: MuscleGroup;
  detail: MuscleDetail | null;
  /** The weighted sets behind the bar. */
  sets: number;
  /** 0 to 1 of the period's sets. */
  share: number;
  /** The whole percent shown, rounded so the whole distribution adds up to 100. */
  percent: number;
  /** How the bar is filled: by its place in the list, never by which muscle it is. */
  fill: BarFill;
};

/** The biggest bar takes the accent; the rest are the foreground at a fading opacity. */
export type BarFill = { kind: "accent" } | { kind: "neutral"; opacity: number };

/**
 * Opacity of the foreground over the track for ranks 1, 2, 3 and 4+. Each step is visibly
 * lighter than the last on the dark and the light track, and no colour implies good or bad.
 */
const NEUTRAL_STEPS = [0.7, 0.52, 0.38, 0.28] as const;

/** The fill of the bar at `rank` (0 is the biggest): accent first, then ever quieter greys. */
export function fillOf(rank: number): BarFill {
  if (rank <= 0) return { kind: "accent" };
  const step = NEUTRAL_STEPS[Math.min(rank, NEUTRAL_STEPS.length) - 1] ?? NEUTRAL_STEPS[0];
  return { kind: "neutral", opacity: step };
}

/** Allocate whole percentage points by largest remainder, with row order breaking ties. */
function wholePercents(sets: readonly number[], total: number): number[] {
  if (total <= 0) return sets.map(() => 0);
  const exact = sets.map((value) => (100 * value) / total);
  const percents = exact.map(Math.floor);
  let left = 100 - percents.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    percents[index] = (percents[index] ?? 0) + 1;
    left -= 1;
  }
  return percents;
}

/** The groups' shares as bars, biggest first; `limit` keeps only the top of the list. */
export function groupRows(shares: MuscleShares, limit?: number): ShareRow[] {
  // Rounded over every group first, so a cut list shows the same numbers as the full one.
  const percents = wholePercents(
    shares.groups.map((group) => group.sets),
    shares.total,
  );
  return shares.groups.slice(0, limit).map((group, index) => ({
    key: group.muscle,
    muscle: group.muscle,
    detail: null,
    sets: group.sets,
    share: group.share,
    percent: percents[index] ?? 0,
    fill: fillOf(index),
  }));
}

/** The details' shares as bars, biggest first. */
export function detailRows(shares: MuscleShares, limit?: number): ShareRow[] {
  // Sets that name no detail stay in the denominator: they take their own slot in the rounding.
  const named = shares.details.reduce((sum, part) => sum + part.sets, 0);
  const unnamed = Math.max(0, shares.total - named);
  const percents = wholePercents(
    [...shares.details.map((part) => part.sets), unnamed],
    shares.total,
  );
  return shares.details.slice(0, limit).map((part, index) => ({
    key: part.detail,
    muscle: part.muscle,
    detail: part.detail,
    sets: part.sets,
    share: part.share,
    percent: percents[index] ?? 0,
    fill: fillOf(index),
  }));
}

/** Whether the period names any detail at all (otherwise the Details view says nothing more). */
export const hasDetails = (shares: MuscleShares) => shares.details.length > 0;

/** "34%" from a row's whole percent. */
export function formatPercent(percent: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    percent / 100,
  );
}
