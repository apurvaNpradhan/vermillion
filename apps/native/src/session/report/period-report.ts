import {
  calendarDay,
  isCounted,
  muscleShares,
  recordCount,
  recordFlags,
  setVolume,
  weekStartDay,
  weeklyDetailVolume,
  weeklyMuscleVolume,
  type DistributionExercise,
  type LoggedSet,
  type MuscleShares,
  type WeekStart,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";

import { buildHistory, DAY_MS, goalStreaks } from "../history/history-calendar";
import { previousReport, reportEnd, reportHistoryWindow, type ReportPeriod } from "./report-period";

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

type History = ReturnType<typeof buildHistory>;

/** The totals of the Sessions of `history` whose day falls in `[start, end)`. */
function statsOf(
  sessions: readonly FinishedSession[],
  history: History,
  start: number,
  end: number,
): PeriodStats {
  const stats = { workouts: 0, sets: 0, volume: 0, seconds: 0 };
  const days = new Set<number>();
  for (const session of sessions) {
    const own = history.bySession.get(session.id);
    if (!own || own.day < start || own.day >= end) continue;
    stats.workouts += own.totals.workouts;
    stats.sets += own.totals.sets;
    stats.volume += own.totals.volume;
    stats.seconds += own.totals.seconds;
    days.add(own.day);
  }
  return { ...stats, trainingDays: days.size };
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
  const byExercise = new Map<string, ExerciseTotal>();
  for (const session of sessions) {
    for (const set of session.sets) {
      const exerciseId = set.exercise_id;
      const title = titles.get(exerciseId);
      if (title === undefined) continue;
      const total = byExercise.get(exerciseId) ?? { exerciseId, title, sets: 0, volume: 0 };
      byExercise.set(exerciseId, total);
      if (!isCounted(set)) continue;
      total.sets += 1;
      total.volume += setVolume(set);
    }
  }
  const all = [...byExercise.values()].filter((total) => total.sets > 0);
  // `sort` on a copy, not `toSorted`: Hermes on the device has no ES2023 array methods.
  const byName = (a: ExerciseTotal, b: ExerciseTotal) =>
    a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
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
  weekCounts: ReadonlyMap<number, number>,
  period: ReportPeriod,
  goal: number | null,
  today: number,
  weekStart: WeekStart,
): number {
  if (goal === null) return 0;
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

function sessionsForRecordBests(
  sessions: readonly FinishedSession[],
  currentSets: readonly LoggedSet[],
  cutoff: number,
): FinishedSession[] {
  const done = new Set<string>();
  for (const set of currentSets) {
    if (isCounted(set)) done.add(set.exercise_id);
  }
  if (done.size === 0) return [];
  return sessions.flatMap((session) => {
    if (Date.parse(session.started_at) >= cutoff) return [];
    const sets = session.sets.filter((set) => done.has(set.exercise_id));
    return sets.length > 0 ? [{ ...session, sets }] : [];
  });
}

/**
 * Uses the comparison period, the report period and the trailing days of its last credited week.
 * Sets already carry their session's bodyweight. `earlierHistory` contains the scoped record
 * history before the UTC cutoff; a full history can supply both through `sessions`.
 */
export function buildPeriodReport(input: {
  period: ReportPeriod;
  sessions: readonly FinishedSession[];
  earlierHistory?: readonly FinishedSession[];
  exercises: readonly ReportExercise[];
  timezone: string;
  weekStart: WeekStart;
  goal: number | null;
  /** The current calendar day. */
  today: number;
}): PeriodReport {
  const { period, exercises, timezone, weekStart, goal, today } = input;
  const end = reportEnd(period);
  const before = previousReport(period);
  const windowed = within(input.sessions, before.start, end + 3 * DAY_MS, timezone);
  const calendar = buildHistory(windowed, timezone, weekStart, () => null);
  const inPeriod = windowed.filter((session) => {
    const day = calendar.bySession.get(session.id)?.day;
    return day !== undefined && day >= period.start && day < end;
  });
  const stats = statsOf(inPeriod, calendar, period.start, end);
  const earlier = statsOf(windowed, calendar, before.start, period.start);
  const previous = earlier.workouts > 0 ? earlier : null;
  const currentSets = inPeriod.flatMap((session) => session.sets);
  const { recordsBefore } = reportHistoryWindow(period);
  const earlierRecords =
    input.earlierHistory ?? sessionsForRecordBests(input.sessions, currentSets, recordsBefore);
  // Keep the boundary sessions in chronological order even when clocks turn back into another day.
  const recordWindow = windowed.filter(
    (session) => Date.parse(session.started_at) >= recordsBefore,
  );
  const recordSets = recordFlags(recordWindow, null, earlierRecords);
  // Each Session counts its own Records once per exercise and kind.
  const records = inPeriod.reduce((sum, session) => sum + recordCount(recordSets, session.sets), 0);
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
    longestStreak: longestStreak(calendar.weekCounts, period, goal, today, weekStart),
  };
}
