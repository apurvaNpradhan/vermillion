import {
  calendarDay,
  muscleShares,
  recordFlags,
  sessionTotals,
  weekStartDay,
  weeklyDetailVolume,
  weeklyMuscleVolume,
  type DistributionExercise,
  type MuscleShares,
  type WeekStart,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";

import { buildHistory, DAY_MS, goalStreaks } from "../history/history-calendar";
import { previousReport, reportEnd, type ReportPeriod } from "./report-period";

/** What the report needs of an exercise: its muscles and its name. */
export type ReportExercise = DistributionExercise & { title: string };

export type PeriodStats = {
  workouts: number;
  /** Distinct calendar days with at least one Session. */
  trainingDays: number;
  sets: number;
  volume: number;
  seconds: number;
};

export type Change = { direction: "up" | "down" | "same"; percent: number };

export type ExerciseTotal = { exerciseId: string; title: string; sets: number; volume: number };

export type PeriodReport = {
  period: ReportPeriod;
  stats: PeriodStats;
  /** The period before it; null when that one had no Sessions, so nothing is compared. */
  previous: PeriodStats | null;
  changes: { [Key in "workouts" | "sets" | "volume" | "seconds"]: Change | null };
  /** Records set in the period, counted the way a Session's summary counts them. */
  records: number;
  topBySets: ExerciseTotal[];
  topByVolume: ExerciseTotal[];
  shares: MuscleShares;
  /** The longest run of consecutive weeks that reached the weekly goal; 0 without a goal. */
  longestStreak: number;
};

/** How many exercises each top list keeps. */
export const TOP_EXERCISES = 5;

/**
 * The Sessions that started in `[start, end)` (calendar days in `timezone`), through the same
 * bucketing as History.
 */
function within(
  sessions: readonly FinishedSession[],
  start: number,
  end: number,
  timezone: string,
): FinishedSession[] {
  return sessions.filter((session) => {
    const day = calendarDay(session.started_at, timezone);
    return day >= start && day < end;
  });
}

function statsOf(
  sessions: readonly FinishedSession[],
  timezone: string,
  weekStart: WeekStart,
): PeriodStats {
  // Sets already carry the bodyweight of their day, so no fallback is needed here.
  const { totals, byDay } = buildHistory(sessions, timezone, weekStart, () => null);
  return { ...totals, trainingDays: byDay.size };
}

/** Up, down or the same as `before`, as a whole percent; null when there is nothing to compare. */
export function change(now: number, before: number | null | undefined): Change | null {
  if (before === null || before === undefined || before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);
  return {
    direction: percent > 0 ? "up" : percent < 0 ? "down" : "same",
    percent: Math.abs(percent),
  };
}

type TopExercises = { bySets: ExerciseTotal[]; byVolume: ExerciseTotal[] };

function topExercises(
  sessions: readonly FinishedSession[],
  exercises: readonly ReportExercise[],
): TopExercises {
  const titles = new Map(exercises.map((exercise) => [exercise.id, exercise.title]));
  const sets = sessions.flatMap((session) => session.sets);
  const ids = [...new Set(sets.map((set) => set.exercise_id))];
  const all = ids.flatMap((exerciseId): ExerciseTotal[] => {
    const title = titles.get(exerciseId);
    if (title === undefined) return [];
    const own = sessionTotals(sets.filter((set) => set.exercise_id === exerciseId));
    return own.sets > 0 ? [{ exerciseId, title, sets: own.sets, volume: own.volume }] : [];
  });
  // `sort` on a copy, not `toSorted`: Hermes on the device has no ES2023 array methods.
  const byName = (a: ExerciseTotal, b: ExerciseTotal) => (a.title < b.title ? -1 : 1);
  return {
    bySets: [...all].sort((a, b) => b.sets - a.sets || byName(a, b)).slice(0, TOP_EXERCISES),
    byVolume: all
      .filter((total) => total.volume > 0)
      .sort((a, b) => b.volume - a.volume || byName(a, b))
      .slice(0, TOP_EXERCISES),
  };
}

/**
 * The longest weekly-goal streak inside the period. A week belongs to the period that holds its
 * fourth day (the rule of the year goal in History), so a split week counts once.
 */
function longestStreak(
  sessions: readonly FinishedSession[],
  period: ReportPeriod,
  goal: number | null,
  today: number,
  timezone: string,
  weekStart: WeekStart,
): number {
  if (goal === null) return 0;
  const { weekCounts } = buildHistory(sessions, timezone, weekStart, () => null);
  const end = reportEnd(period);
  const counts = new Map<number, number>();
  for (const [week, count] of weekCounts) {
    const middle = week + 3 * DAY_MS;
    if (middle >= period.start && middle < end) counts.set(week, count);
  }
  const current = weekStartDay(today, weekStart);
  // A week still running cannot break the streak, but it only counts once it reaches the goal.
  return goalStreaks(counts, goal, current).longest;
}

/**
 * Everything the report of one month or year shows. `sessions` are all the finished Sessions (the
 * previous period and the earlier Records need them), with each set's bodyweight already attached.
 * Totals, Records, volume and muscle shares come from the helpers History, the Session summary and
 * the Muscles screen use, so the report agrees with them.
 */
export function buildPeriodReport(input: {
  period: ReportPeriod;
  sessions: readonly FinishedSession[];
  exercises: readonly ReportExercise[];
  timezone: string;
  weekStart: WeekStart;
  goal: number | null;
  /** The current calendar day. */
  today: number;
}): PeriodReport {
  const { period, sessions, exercises, timezone, weekStart, goal, today } = input;
  const end = reportEnd(period);
  const inPeriod = within(sessions, period.start, end, timezone);
  const before = previousReport(period);
  const earlier = within(sessions, before.start, period.start, timezone);
  const stats = statsOf(inPeriod, timezone, weekStart);
  const previous = earlier.length > 0 ? statsOf(earlier, timezone, weekStart) : null;
  const flagged = recordFlags(sessions);
  const records = inPeriod
    .flatMap((session) => session.sets)
    .reduce((count, set) => count + (flagged.get(set.id)?.length ?? 0), 0);
  const range = { start: period.start, end };
  const top = topExercises(inPeriod, exercises);
  return {
    period,
    stats,
    previous,
    changes: {
      workouts: change(stats.workouts, previous?.workouts),
      sets: change(stats.sets, previous?.sets),
      volume: change(stats.volume, previous?.volume),
      seconds: change(stats.seconds, previous?.seconds),
    },
    records,
    topBySets: top.bySets,
    topByVolume: top.byVolume,
    shares: muscleShares(
      weeklyMuscleVolume(inPeriod, exercises, range, timezone),
      weeklyDetailVolume(inPeriod, exercises, range, timezone),
    ),
    longestStreak: longestStreak(sessions, period, goal, today, timezone, weekStart),
  };
}
