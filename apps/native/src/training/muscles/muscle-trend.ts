import {
  shiftWeek,
  weeklyMuscleVolume,
  type DistributionExercise,
  type MuscleGroup,
  type SessionHistory,
  type WeekRange,
} from "@workspace/shared";

/** Weeks the muscle chart draws, the current one last. */
export const TREND_WEEKS = 8;
/** Whole weeks before the current one that the average marker covers. */
export const AVERAGE_WEEKS = 4;

export type MuscleTrend = {
  /** The weeks drawn, oldest first; the last is the current week. */
  weeks: readonly WeekRange[];
  /** Weighted sets per week for each muscle that had any, aligned with `weeks`. */
  sets: ReadonlyMap<MuscleGroup, readonly number[]>;
};

/** Weighted muscle sets in each of the last {@link TREND_WEEKS} weeks, ending with `current`. */
export function muscleTrend(
  sessions: readonly Pick<SessionHistory, "started_at" | "sets">[],
  exercises: readonly DistributionExercise[],
  current: WeekRange,
  timezone: string,
): MuscleTrend {
  const weeks = Array.from({ length: TREND_WEEKS }, (_, index) =>
    shiftWeek(current, TREND_WEEKS - 1 - index),
  );
  const sets = new Map<MuscleGroup, number[]>();
  weeks.forEach((week, index) => {
    for (const load of weeklyMuscleVolume(sessions, exercises, week, timezone)) {
      const series = sets.get(load.muscle) ?? Array.from({ length: TREND_WEEKS }, () => 0);
      series[index] = load.sets;
      sets.set(load.muscle, series);
    }
  });
  return { weeks, sets };
}

/**
 * A muscle's average sets a week over the {@link AVERAGE_WEEKS} whole weeks before the current
 * one, so the unfinished week never drags it down. Zero for a muscle with no sets in them.
 */
export function priorAverage(series: readonly number[] | undefined): number {
  if (series === undefined) return 0;
  const prior = series.slice(-1 - AVERAGE_WEEKS, -1);
  return prior.reduce((total, sets) => total + sets, 0) / AVERAGE_WEEKS;
}
