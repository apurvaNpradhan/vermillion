import type { LoggedSet } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { buildPeriodReport, change, type ReportExercise } from "./period-report";
import { parseReportKey, reportHistoryWindow, type ReportPeriod } from "./report-period";

const bench: ReportExercise = {
  id: "bench",
  title: "Bench press",
  primary_muscle: "chest",
  secondary_muscles: ["triceps"],
};
const squat: ReportExercise = {
  id: "squat",
  title: "Squat",
  primary_muscle: "quadriceps",
  secondary_muscles: [],
};
const exercises = [bench, squat];

let counter = 0;
const lift = (exerciseId: string, weight: number, reps: number): LoggedSet => {
  counter += 1;
  return {
    id: `set-${counter}`,
    exercise_id: exerciseId,
    exercise_type: "weight_reps",
    kind: "working",
    completed_at: "2026-01-01T00:00:00Z",
    weight_kg: weight,
    reps,
    duration_s: null,
    distance_m: null,
    floors: null,
    steps: null,
  };
};
const session = (
  id: string,
  started_at: string,
  sets: LoggedSet[],
  durationS: number | null = 3600,
): FinishedSession => ({
  id,
  started_at,
  finished_at: started_at,
  durationS,
  workoutId: null,
  title: "Strength",
  sets,
});
const period = (key: string): ReportPeriod => {
  const parsed = parseReportKey(key);
  if (!parsed) throw new Error(key);
  return parsed;
};
const build = (
  key: string,
  sessions: FinishedSession[],
  goal: number | null = 2,
  timezone = "UTC",
  today = Date.UTC(2026, 10, 20),
) =>
  buildPeriodReport({
    period: period(key),
    sessions,
    exercises,
    timezone,
    weekStart: "monday",
    goal,
    today,
  });

describe("change", () => {
  it("rounds to a whole percent and has nothing to compare against zero", () => {
    expect(change(150, 100)).toEqual({ direction: "up", percent: 50 });
    expect(change(75, 100)).toEqual({ direction: "down", percent: 25 });
    expect(change(100, 100)).toEqual({ direction: "same", percent: 0 });
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
  });
});

describe("buildPeriodReport", () => {
  const sessions = [
    session("a", "2026-10-05T10:00:00Z", [lift("bench", 100, 5), lift("bench", 100, 5)]),
    session("b", "2026-10-05T18:00:00Z", [lift("squat", 140, 5)]),
    session("c", "2026-10-20T10:00:00Z", [lift("bench", 90, 8)]),
    session("d", "2026-09-10T10:00:00Z", [lift("bench", 80, 5)], 1800),
    session("other-year", "2025-10-10T10:00:00Z", [lift("bench", 60, 5)]),
  ];

  it("totals the month through History's rules", () => {
    const report = build("2026-10", sessions);
    expect(report.stats).toEqual({
      workouts: 3,
      trainingDays: 2,
      sets: 4,
      volume: 1000 + 700 + 720,
      seconds: 3 * 3600,
    });
  });

  it("compares with the previous month, and not when it was empty", () => {
    const report = build("2026-10", sessions);
    expect(report.previous?.workouts).toBe(1);
    expect(report.changes.workouts).toEqual({ direction: "up", percent: 200 });
    expect(build("2026-12", sessions).previous).toBeNull();
    expect(build("2026-12", sessions).changes.volume).toBeNull();
  });

  it("ranks exercises by sets and by volume", () => {
    const report = build("2026-10", sessions);
    expect(report.topBySets.map((row) => [row.title, row.sets])).toEqual([
      ["Bench press", 3],
      ["Squat", 1],
    ]);
    expect(report.topByVolume.map((row) => row.title)).toEqual(["Bench press", "Squat"]);
  });

  it("counts a Record only when it beats what came before", () => {
    // October 2025 holds the first lift ever, which has nothing to beat; later months beat it.
    expect(build("2025-10", sessions).records).toBe(0);
    expect(build("2026-09", sessions).records).toBeGreaterThan(0);
    expect(build("2026-10", sessions).records).toBeGreaterThan(0);
  });

  it("splits the muscles into shares that add up", () => {
    const { shares } = build("2026-10", sessions);
    expect(shares.groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1);
    expect(shares.groups[0]?.muscle).toBe("chest");
  });

  it("covers the whole year for a Year in review", () => {
    const report = build("2026", sessions);
    expect(report.stats.workouts).toBe(4);
    expect(report.previous?.workouts).toBe(1);
  });

  it("finds the longest run of weeks that reached the goal", () => {
    // Goal 2: the week of 5 Oct has two Sessions; 12 Oct none; 19 Oct one.
    expect(build("2026-10", sessions).longestStreak).toBe(1);
    expect(build("2026-10", sessions, null).longestStreak).toBe(0);
    const weekly = [
      session("w1", "2026-10-05T10:00:00Z", [lift("bench", 50, 5)]),
      session("w1b", "2026-10-06T10:00:00Z", [lift("bench", 50, 5)]),
      session("w2", "2026-10-12T10:00:00Z", [lift("bench", 50, 5)]),
      session("w2b", "2026-10-14T10:00:00Z", [lift("bench", 50, 5)]),
      session("w3", "2026-10-19T10:00:00Z", [lift("bench", 50, 5)]),
      session("w3b", "2026-10-21T10:00:00Z", [lift("bench", 50, 5)]),
    ];
    expect(build("2026-10", weekly).longestStreak).toBe(3);
  });

  it("buckets a Session by the user's local day, not the UTC date", () => {
    // 1 Nov 03:30 UTC is still 31 Oct (20:30) in Los Angeles, where daylight time ends that night,
    // but already 1 Nov (16:30) in Auckland (UTC+13): the UTC date names another month.
    const late = session("late", "2026-11-01T03:30:00Z", [lift("bench", 50, 5)]);
    const early = session("early", "2026-10-31T12:00:00Z", [lift("bench", 50, 5)]);
    const all = [late, early];
    expect(build("2026-10", all, null, "America/Los_Angeles").stats.workouts).toBe(2);
    expect(build("2026-11", all, null, "America/Los_Angeles").stats.workouts).toBe(0);
    // In Auckland both fall on 1 Nov (late: 16:30, early: 01:00).
    expect(build("2026-10", all, null, "Pacific/Auckland").stats.workouts).toBe(0);
    expect(build("2026-11", all, null, "Pacific/Auckland").stats.workouts).toBe(2);
    expect(build("2026-10", all, null, "UTC").stats.workouts).toBe(1);
  });

  it("uses chronological record comparisons when the clock falls back into October", () => {
    const earlier = session("oct-early", "2009-10-20T12:00:00Z", [lift("bench", 100, 5)]);
    const first = session("nov-first", "2009-11-01T03:00:30Z", [lift("bench", 110, 5)]);
    // At 03:01 UTC, Goose Bay's clocks moved from 00:01 November 1 back to October 31.
    const repeated = session("oct-repeat", "2009-11-01T03:30:00Z", [lift("bench", 200, 5)]);
    const later = session("nov-later", "2009-11-01T04:15:00Z", [lift("bench", 130, 5)]);
    const all = [earlier, first, repeated, later];
    const timezone = "America/Goose_Bay";
    const month = period("2009-11");
    const { from, to, recordsBefore } = reportHistoryWindow(month);
    const report = build("2009-11", all, null, timezone);
    expect(
      buildPeriodReport({
        period: month,
        sessions: all.filter((item) => {
          const started = Date.parse(item.started_at);
          return started >= from && started < to;
        }),
        earlierHistory: all.filter((item) => Date.parse(item.started_at) < recordsBefore),
        exercises,
        timezone,
        weekStart: "monday",
        goal: null,
        today: Date.UTC(2026, 10, 20),
      }),
    ).toEqual(report);
    expect(report.stats.workouts).toBe(2);
    expect(report.previous?.workouts).toBe(2);
    expect(report.records).toBe(5);
  });

  it("credits a week split across December and January to the month with its fourth day", () => {
    // Monday weeks: 29 Dec 2025 to 4 Jan 2026 has its fourth day on 1 Jan, so it is January's.
    const split = [
      session("dec", "2025-12-30T10:00:00Z", [lift("bench", 50, 5)]),
      session("jan", "2026-01-02T10:00:00Z", [lift("bench", 50, 5)]),
    ];
    expect(build("2025-12", split).longestStreak).toBe(0);
    expect(build("2026-01", split).longestStreak).toBe(1);
    // 28 Dec 2026 to 3 Jan 2027 has its fourth day on 31 Dec, so it is December's.
    const other = [
      session("dec", "2026-12-29T10:00:00Z", [lift("bench", 50, 5)]),
      session("jan", "2027-01-02T10:00:00Z", [lift("bench", 50, 5)]),
    ];
    expect(build("2026-12", other, 2, "UTC", Date.UTC(2027, 5, 1)).longestStreak).toBe(1);
    expect(build("2027-01", other, 2, "UTC", Date.UTC(2027, 5, 1)).longestStreak).toBe(0);
  });

  it("matches a full history using the comparison window and only earlier records", () => {
    const far = session("far", "2019-03-03T10:00:00Z", [lift("bench", 130, 5)]);
    const unrelated = session("curl", "2019-05-03T10:00:00Z", [lift("curl", 100, 5)]);
    const later = session("later", "2027-05-03T10:00:00Z", [lift("bench", 200, 5)]);
    const windowed = sessions.filter((item) => item.id !== "other-year");
    const earlier = [
      far,
      ...sessions.filter((item) => item.id === "d" || item.id === "other-year"),
    ];
    const full = build("2026-10", [...sessions, far, unrelated, later]);
    const bounded = buildPeriodReport({
      period: period("2026-10"),
      sessions: windowed,
      earlierHistory: earlier,
      exercises,
      timezone: "UTC",
      weekStart: "monday",
      goal: 2,
      today: Date.UTC(2026, 10, 20),
    });

    expect(bounded).toEqual(full);
    expect(full.records).toBeLessThan(build("2026-10", sessions).records);
  });

  it("ranks every exercise of the period, not a fixed number of them", () => {
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...bench,
      id: `ex-${index}`,
      title: `Exercise ${String(index).padStart(3, "0")}`,
    }));
    const done = session(
      "big",
      "2026-10-05T10:00:00Z",
      many.map((exercise, index) => lift(exercise.id, 50 + index, 5)),
    );
    const report = buildPeriodReport({
      period: period("2026"),
      sessions: [done],
      exercises: many,
      timezone: "UTC",
      weekStart: "monday",
      goal: null,
      today: Date.UTC(2026, 10, 20),
    });
    expect(report.stats.sets).toBe(250);
    expect(report.topBySets).toHaveLength(5);
    expect(report.topByVolume[0]?.exerciseId).toBe("ex-249");
    expect(report.shares.total).toBe(375);
  });

  it("is empty for a period without Sessions", () => {
    const report = build("2024-03", sessions);
    expect(report.stats.workouts).toBe(0);
    expect(report.shares.groups).toEqual([]);
    expect(report.topBySets).toEqual([]);
  });
});
