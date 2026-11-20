import type { LoggedSet } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { buildPeriodReport, change, type ReportExercise } from "./period-report";
import { parseReportKey, type ReportPeriod } from "./report-period";

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
const build = (key: string, sessions: FinishedSession[], goal: number | null = 2) =>
  buildPeriodReport({
    period: period(key),
    sessions,
    exercises,
    timezone: "UTC",
    weekStart: "monday",
    goal,
    today: Date.UTC(2026, 10, 20),
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

  it("is empty for a period without Sessions", () => {
    const report = build("2024-03", sessions);
    expect(report.stats.workouts).toBe(0);
    expect(report.shares.groups).toEqual([]);
    expect(report.topBySets).toEqual([]);
  });
});
