import type { LoggedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { heatmapTotals, setsByDay } from "./heatmap-data";

const set = (kind: LoggedSet["kind"], done: boolean): LoggedSet => ({
  id: Math.random().toString(),
  exercise_id: "e",
  exercise_type: "weight_reps",
  kind,
  completed_at: done ? "2026-11-18T09:00:00Z" : null,
});

describe("setsByDay", () => {
  it("counts only ticked sets that are not warm-ups", () => {
    const counts = setsByDay(
      [
        {
          started_at: "2026-11-18T09:00:00Z",
          sets: [
            set("working", true),
            set("working", true),
            set("warmup", true),
            set("working", false),
          ],
        },
      ],
      "UTC",
    );
    expect([...counts.values()]).toEqual([2]);
  });
  it("adds the Sessions of one day and buckets by the user's zone", () => {
    const counts = setsByDay(
      [
        { started_at: "2026-11-18T01:00:00Z", sets: [set("working", true)] },
        { started_at: "2026-11-18T08:00:00Z", sets: [set("working", true)] },
        { started_at: "2026-11-18T23:00:00Z", sets: [set("working", true)] },
      ],
      "Asia/Kolkata",
    );
    // 23:00 UTC is already the 19th in Kolkata.
    expect([...counts.values()].toSorted()).toEqual([1, 2]);
  });
  it("leaves a Session with no counted sets out", () => {
    expect(
      setsByDay([{ started_at: "2026-11-18T09:00:00Z", sets: [set("warmup", true)] }], "UTC").size,
    ).toBe(0);
  });
});

describe("heatmapTotals", () => {
  it("sums the sets and days from a day on", () => {
    const counts = new Map([
      [1, 5],
      [2, 7],
      [3, 3],
    ]);
    expect(heatmapTotals(counts, 2)).toEqual({ sets: 10, days: 2 });
  });
});
