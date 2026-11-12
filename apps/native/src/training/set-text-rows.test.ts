import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { plannedColumns, plannedRows } from "./set-text-rows";

const sets: PlannedSet[] = [
  { kind: "warmup", weight_kg: 40, reps_min: 10, reps_max: 10, effort_min: 6, effort_max: 6 },
  { kind: "working", weight_kg: 100, reps_min: 5, reps_max: 8, effort_min: 8, effort_max: 9 },
  { kind: "working" },
];

describe("planned set rows", () => {
  it("adds an effort column only when a set has effort", () => {
    expect(plannedColumns("weight_reps", sets)).toEqual(["weight", "reps", "effort"]);
    expect(plannedColumns("weight_reps", [{ kind: "working" }])).toEqual(["weight", "reps"]);
    expect(plannedColumns("duration", [{ kind: "working" }])).toEqual(["duration"]);
  });
  it("writes ranges, dashes for empty cells and no effort for warm-ups", () => {
    const columns = plannedColumns("weight_reps", sets);
    const rows = plannedRows(sets, ["W", "1", "2"], columns, "kg", "rpe");
    expect(rows.map((row) => row.cells)).toEqual([
      ["40", "10", "–"],
      ["100", "5–8", "8–9"],
      ["–", "–", "–"],
    ]);
    expect(rows.map((row) => row.marker)).toEqual(["W", "1", "2"]);
  });
});
