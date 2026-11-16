import { describe, expect, it } from "vitest";

import { displayedSessionsPerWeek, sessionGoal, trainingSlotCount } from "./session-goal";

const slots = (...ids: (string | null)[]) => ids.map((workoutId) => ({ workoutId }));

describe("sessionGoal", () => {
  it("prefers the Program's own value", () => {
    expect(sessionGoal({ sessionsPerWeek: 5, slots: slots("a", "b") }, 3)).toBe(5);
  });

  it("counts workout slots of a rotation of seven or fewer", () => {
    expect(sessionGoal({ sessionsPerWeek: null, slots: slots("a", null, "b", "c") }, 3)).toBe(3);
    expect(
      sessionGoal({ sessionsPerWeek: null, slots: slots("a", "b", "c", "d", null, null, null) }, 2),
    ).toBe(4);
  });

  it("falls back to the preference for a longer rotation", () => {
    const long = slots("a", "b", "c", "d", "e", "f", "g", "h");
    expect(sessionGoal({ sessionsPerWeek: null, slots: long }, 4)).toBe(4);
    expect(sessionGoal({ sessionsPerWeek: null, slots: long }, null)).toBeNull();
  });

  it("falls back to the preference for a rotation with no workouts", () => {
    expect(sessionGoal({ sessionsPerWeek: null, slots: slots(null, null) }, 3)).toBe(3);
    expect(sessionGoal({ sessionsPerWeek: null, slots: [] }, null)).toBeNull();
  });

  it("uses the preference with no active Program, and null with nothing set", () => {
    expect(sessionGoal(null, 3)).toBe(3);
    expect(sessionGoal(null, null)).toBeNull();
  });
});

describe("displayedSessionsPerWeek", () => {
  it("shows the explicit value, else the workout slot count, kept in range", () => {
    expect(displayedSessionsPerWeek(5, slots("a"))).toBe(5);
    expect(displayedSessionsPerWeek(null, slots("a", null, "b"))).toBe(2);
    expect(displayedSessionsPerWeek(null, slots(null))).toBe(1);
    expect(trainingSlotCount(slots("a", null))).toBe(1);
  });
});
