import type { LoggedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { topSet } from "./top-set";

const set = (id: string, values: Partial<LoggedSet> = {}): LoggedSet => ({
  id,
  exercise_id: "squat",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-11-02T10:00:00Z",
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  floors: null,
  steps: null,
  ...values,
});

describe("topSet", () => {
  it("takes the heaviest set and breaks a tie with reps", () => {
    const sets = [
      set("a", { weight_kg: 100, reps: 5 }),
      set("b", { weight_kg: 110, reps: 3 }),
      set("c", { weight_kg: 110, reps: 4 }),
    ];
    expect(topSet(sets, "squat", "weight_reps")?.id).toBe("c");
  });

  it("leaves out warm-ups, unticked sets and other exercises", () => {
    const sets = [
      set("warm", { kind: "warmup", weight_kg: 200, reps: 5 }),
      set("open", { completed_at: null, weight_kg: 190, reps: 5 }),
      set("other", { exercise_id: "bench", weight_kg: 180, reps: 5 }),
      set("work", { weight_kg: 90, reps: 5 }),
    ];
    expect(topSet(sets, "squat", "weight_reps")?.id).toBe("work");
  });

  it("ranks rep-only types by reps and timed types by duration", () => {
    expect(
      topSet([set("a", { reps: 8 }), set("b", { reps: 12 })], "squat", "bodyweight_reps")?.id,
    ).toBe("b");
    expect(
      topSet([set("a", { duration_s: 60 }), set("b", { duration_s: 90 })], "squat", "duration")?.id,
    ).toBe("b");
  });

  it("returns null without a counted set", () => {
    expect(topSet([], "squat", "weight_reps")).toBeNull();
  });
});
