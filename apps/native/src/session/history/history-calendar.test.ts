import type { FinishedSession } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  WEEK_MS,
  buildHistory,
  goalHit,
  goalStreaks,
  monthRows,
  monthlyWorkouts,
  periodStart,
  shiftPeriod,
  yearGoal,
} from "./history-calendar";

const day = (key: string) => Date.parse(key);
const session = (id: string, started_at: string): FinishedSession => ({
  id,
  started_at,
  finished_at: new Date(Date.parse(started_at) + 30 * 60_000).toISOString(),
  durationS: null,
  workoutId: null,
  title: "Strength",
  sets: [],
});

describe("calendar periods", () => {
  it("aligns the first and last rows to the preferred week start", () => {
    const november = day("2026-11-01");
    expect(monthRows(november, "monday")[0]).toEqual({
      week: day("2026-10-26"),
      days: [null, null, null, null, null, null, november],
    });
    expect(monthRows(november, "sunday")[0]?.days[0]).toBe(november);
    expect(monthRows(november, "saturday")[0]?.days[1]).toBe(november);
    expect(monthRows(november, "monday").at(-1)?.days[0]).toBe(day("2026-11-30"));
  });

  it("omits a spare row in a four-week February and includes leap day in a leap year", () => {
    expect(monthRows(day("2027-02-01"), "monday")).toHaveLength(4);
    expect(monthRows(day("2028-02-01"), "monday").flatMap((row) => row.days)).toContain(
      day("2028-02-29"),
    );
  });

  it("pages across year boundaries", () => {
    expect(shiftPeriod("month", day("2026-12-01"), 1)).toBe(day("2027-01-01"));
    expect(shiftPeriod("year", day("2027-01-01"), -1)).toBe(day("2026-01-01"));
    expect(shiftPeriod("week", day("2026-12-28"), 1)).toBe(day("2027-01-04"));
    expect(periodStart("week", day("2027-01-01"), "monday")).toBe(day("2026-12-28"));
  });
});

describe("history totals", () => {
  it("counts multiple workouts on a local day and puts UTC midnight in the correct week and month", () => {
    const rows = [
      session("next", "2026-11-02T08:30:00Z"),
      session("later", "2026-11-01T06:00:00Z"),
      session("earliest", "2026-11-01T02:00:00Z"),
    ];
    const history = buildHistory(rows, "America/Los_Angeles", "sunday", () => null);

    expect(history.byDay.get(day("2026-10-31"))?.map((row) => row.id)).toEqual([
      "later",
      "earliest",
    ]);
    expect(history.byMonth.get(day("2026-10-01"))?.totals.workouts).toBe(2);
    expect(history.byMonth.get(day("2026-11-01"))?.totals.workouts).toBe(1);
    expect([...history.weekCounts]).toEqual([
      [day("2026-11-01"), 1],
      [day("2026-10-25"), 2],
    ]);
    expect(goalHit(history.weekCounts.get(day("2026-10-25")) ?? 0, 2)).toBe(true);
    expect(history.firstDay).toBe(day("2026-10-31"));
  });

  it("sums counted sets, bodyweight volume and both forms of elapsed time", () => {
    const first = session("first", "2025-12-30T12:00:00Z");
    const second = session("second", "2026-02-01T12:00:00Z");
    const set: FinishedSession["sets"][number] = {
      id: "set",
      exercise_id: "pull-up",
      exercise_type: "bodyweight_reps",
      kind: "working",
      completed_at: first.finished_at,
      reps: 5,
    };
    first.sets.push(set, { ...set, id: "warmup", kind: "warmup" });
    second.durationS = 3600;
    const history = buildHistory([second, first], "UTC", "monday", () => 80);

    expect(history.totals).toEqual({ workouts: 2, sets: 1, volume: 400, seconds: 5400 });
    expect(history.byYear.get(day("2025-01-01"))?.totals.volume).toBe(400);
    expect(history.byYear.get(day("2026-01-01"))?.totals.seconds).toBe(3600);
    expect(monthlyWorkouts(history, day("2026-03-05"), "monday")).toEqual([
      { month: day("2025-12-01"), count: 1 },
      { month: day("2026-01-01"), count: 0 },
      { month: day("2026-02-01"), count: 1 },
      { month: day("2026-03-01"), count: 0 },
    ]);
  });

  it("keeps empty history empty across totals and the chart", () => {
    const history = buildHistory([], "UTC", "monday", () => null);
    expect(history.firstDay).toBeNull();
    expect(history.totals.workouts).toBe(0);
    expect(monthlyWorkouts(history, day("2026-01-01"), "monday")).toEqual([]);
  });
});

describe("weeks on goal", () => {
  it("keeps the current streak through an unfinished week and breaks it after a miss", () => {
    const week = day("2026-03-02");
    const counts = new Map([
      [week + 2 * WEEK_MS, 1],
      [week, 2],
      [week + WEEK_MS, 4],
      [week + 4 * WEEK_MS, 3],
    ]);
    expect(goalStreaks(counts, 2, week + 2 * WEEK_MS)).toEqual({ current: 2, longest: 2 });
    expect(goalStreaks(counts, 2, week + 3 * WEEK_MS)).toEqual({ current: 0, longest: 2 });
    expect(goalStreaks(counts, 2, week + 4 * WEEK_MS)).toEqual({ current: 1, longest: 2 });
    expect(goalStreaks(counts, null, week + 4 * WEEK_MS)).toEqual({ current: 0, longest: 0 });
  });

  it("assigns split weeks to the year holding the majority of their days", () => {
    const previousYear = day("2026-01-01");
    const nextYear = day("2027-01-01");
    const split = day("2026-12-28");
    const counts = new Map([
      [split, 2],
      [split + WEEK_MS, 3],
      [split + 2 * WEEK_MS, 4],
    ]);
    expect(yearGoal(counts, 2, previousYear, "monday", split + WEEK_MS)).toEqual({
      reached: 1,
      total: 53,
    });
    expect(yearGoal(counts, 2, nextYear, "monday", split + WEEK_MS)).toEqual({
      reached: 1,
      total: 52,
    });
    const sundaySplit = nextYear - 5 * DAY_MS;
    expect(
      yearGoal(new Map([[sundaySplit, 2]]), 2, previousYear, "sunday", sundaySplit).reached,
    ).toBe(1);
  });
});
