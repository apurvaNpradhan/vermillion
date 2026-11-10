import { describe, expect, it } from "vitest";

import { loggedSet, setOf } from "./session-fixtures";
import { setVolume } from "./volume";

describe("setVolume", () => {
  it("is weight times reps", () => {
    expect(setVolume(loggedSet({ weight_kg: 60, reps: 8 }))).toBe(480);
  });

  it("is 0 without reps or weight", () => {
    expect(setVolume(loggedSet({ weight_kg: 60, reps: null }))).toBe(0);
    expect(setVolume(loggedSet({ weight_kg: null, reps: 8 }))).toBe(0);
  });

  it("uses the bodyweight for bodyweight types and adds nothing without one", () => {
    const pushUp = setOf("bodyweight_reps", "working", { weight_kg: null, reps: 10 });
    expect(setVolume(pushUp, 80)).toBe(800);
    expect(setVolume(pushUp)).toBe(0);
    expect(setVolume(pushUp, null)).toBe(0);
  });

  it("uses bodyweight minus assistance for assisted types, with and without a bodyweight", () => {
    const assisted = setOf("bodyweight_assisted_reps", "working", { weight_kg: 20, reps: 6 });
    expect(setVolume(assisted, 80)).toBe(360);
    expect(setVolume(assisted)).toBe(0);
    const heavyAssist = setOf("bodyweight_assisted_reps", "working", { weight_kg: 90, reps: 6 });
    expect(setVolume(heavyAssist, 80)).toBe(0);
  });

  it("is 0 for timed types", () => {
    expect(setVolume(setOf("duration", "working", { duration_s: 60 }), 80)).toBe(0);
  });
});
