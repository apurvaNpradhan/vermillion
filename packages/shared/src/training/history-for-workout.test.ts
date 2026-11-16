import { describe, expect, it } from "vitest";

import { historyForWorkout } from "./history-for-workout";
import { previousFor } from "./previous-for";
import { loggedSet, sessionOf } from "./session-fixtures";

const entry = (id: string, startedAt: string, workoutId: string | null, weight: number) => ({
  ...sessionOf(id, startedAt, [loggedSet({ weight_kg: weight })]),
  workoutId,
});

describe("historyForWorkout", () => {
  it("keeps only the Sessions of the same Workout", () => {
    const upper = entry("a", "2026-01-02T10:00:00Z", "upper", 100);
    const pull = entry("b", "2026-01-03T10:00:00Z", "pull", 80);
    expect(historyForWorkout([pull, upper], "upper")).toEqual([upper]);
  });

  it("falls back to every Session when the Workout never had the exercise", () => {
    const pull = entry("b", "2026-01-03T10:00:00Z", "pull", 80);
    const adhoc = entry("c", "2026-01-01T10:00:00Z", null, 70);
    expect(historyForWorkout([pull, adhoc], "upper")).toEqual([pull, adhoc]);
  });

  it("uses every Session for an ad-hoc Session", () => {
    const upper = entry("a", "2026-01-02T10:00:00Z", "upper", 100);
    const pull = entry("b", "2026-01-03T10:00:00Z", "pull", 80);
    expect(historyForWorkout([pull, upper], null)).toEqual([pull, upper]);
  });

  it("lets an older same-Workout Session win over a newer one from another Workout", () => {
    const upper = entry("a", "2026-01-02T10:00:00Z", "upper", 100);
    const pull = entry("b", "2026-01-09T10:00:00Z", "pull", 80);
    const scoped = historyForWorkout([pull, upper], "upper");
    expect(previousFor(scoped, "working", 0)?.weight_kg).toBe(100);
    expect(previousFor([pull, upper], "working", 0)?.weight_kg).toBe(80);
  });
});
