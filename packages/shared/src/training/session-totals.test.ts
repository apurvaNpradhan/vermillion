import { describe, expect, it } from "vitest";

import { loggedSet, setOf, untickedSet } from "./session-fixtures";
import { sessionTotals } from "./volume";

describe("sessionTotals", () => {
  it("is empty for no sets", () => {
    expect(sessionTotals([])).toEqual({ volume: 0, sets: 0, reps: 0 });
  });

  it("counts working, drop and failure sets and leaves out warm-ups and unticked sets", () => {
    const totals = sessionTotals([
      loggedSet({ kind: "warmup", weight_kg: 40, reps: 10 }),
      loggedSet({ weight_kg: 100, reps: 5 }),
      loggedSet({ kind: "drop", weight_kg: 80, reps: 8 }),
      loggedSet({ kind: "failure", weight_kg: 60, reps: 10 }),
      untickedSet({ weight_kg: 100, reps: 5 }),
    ]);
    expect(totals).toEqual({ volume: 500 + 640 + 600, sets: 3, reps: 23 });
  });

  it("counts bodyweight reps without volume until a bodyweight is known", () => {
    const sets = [
      setOf("bodyweight_reps", "working", { weight_kg: null, reps: 10 }),
      setOf("bodyweight_assisted_reps", "working", { weight_kg: 20, reps: 5 }),
    ];
    expect(sessionTotals(sets)).toEqual({ volume: 0, sets: 2, reps: 15 });
    expect(sessionTotals(sets, 80)).toEqual({ volume: 800 + 300, sets: 2, reps: 15 });
  });
});
