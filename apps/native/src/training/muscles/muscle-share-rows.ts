import {
  MUSCLE_GROUPS,
  type MuscleDetail,
  type MuscleGroup,
  type MuscleShares,
} from "@workspace/shared";

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
  /** Which of the five chart tokens colours it (1 to 5). */
  tone: 1 | 2 | 3 | 4 | 5;
};

const TONES = [1, 2, 3, 4, 5] as const;

/** A group keeps one chart colour everywhere; its details wear it too. */
export function toneOf(muscle: MuscleGroup): ShareRow["tone"] {
  return TONES[Math.max(0, MUSCLE_GROUPS.indexOf(muscle)) % TONES.length] ?? 1;
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
    tone: toneOf(group.muscle),
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
    tone: toneOf(part.muscle),
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
