import { withWarmupsCounted, type LoggedSet, type SessionHistory } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { AVERAGE_WEEKS, muscleTrend, priorAverage, TREND_WEEKS } from "./muscle-trend";

const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
const DAY = 86_400_000;
// Weeks start on Monday; the current one runs 16 to 22 November 2026.
const current = { start: day("2026-11-16"), end: day("2026-11-23") };
const press = [{ id: "press", primary_muscle: "chest", secondary_muscles: ["triceps"] }] as const;

const set = (id: string, kind: LoggedSet["kind"], completed: boolean): LoggedSet => ({
  id,
  exercise_id: "press",
  exercise_type: "weight_reps",
  kind,
  completed_at: completed ? "2026-11-18T09:00:00Z" : null,
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  floors: null,
  steps: null,
});
const session = (startedAt: string, sets: LoggedSet[]): SessionHistory => ({
  id: startedAt,
  started_at: startedAt,
  finished_at: startedAt,
  sets,
});

describe("muscleTrend", () => {
  const sessions = [
    session("2026-11-17T09:00:00Z", [set("a", "working", true), set("b", "working", true)]),
    session("2026-11-03T09:00:00Z", [set("c", "working", true)]),
  ];
  const trend = muscleTrend(sessions, press, current, "UTC");

  it("covers eight weeks ending with the current one", () => {
    expect(trend.weeks).toHaveLength(TREND_WEEKS);
    expect(trend.weeks.at(-1)).toEqual(current);
    expect(trend.weeks[0]?.start).toBe(current.start - 7 * 7 * DAY);
  });

  it("counts a primary muscle fully and a secondary one by half, week by week", () => {
    expect(trend.sets.get("chest")).toEqual([0, 0, 0, 0, 0, 1, 0, 2]);
    expect(trend.sets.get("triceps")).toEqual([0, 0, 0, 0, 0, 0.5, 0, 1]);
  });

  it("leaves a muscle without sets out", () => {
    expect(trend.sets.has("calves")).toBe(false);
  });

  it("counts ticked warm-ups only when the preference says so", () => {
    const warm = [
      session("2026-11-18T09:00:00Z", [set("w", "warmup", true), set("x", "warmup", false)]),
    ];
    const sets = (countWarmups: boolean) =>
      muscleTrend(withWarmupsCounted(warm, countWarmups), press, current, "UTC").sets.get("chest");
    expect(sets(true)?.at(-1)).toBe(1);
    expect(sets(false)).toBeUndefined();
  });
});

describe("priorAverage", () => {
  it("averages the four whole weeks before the current one", () => {
    expect(AVERAGE_WEEKS).toBe(4);
    expect(priorAverage([9, 9, 9, 9, 2, 4, 6, 8, 50])).toBe(5);
  });

  it("counts a week without sets as zero and a missing muscle as zero", () => {
    expect(priorAverage([0, 0, 0, 0, 0, 0, 0, 8, 3])).toBe(2);
    expect(priorAverage(undefined)).toBe(0);
  });
});
