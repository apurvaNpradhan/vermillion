import { describe, expect, it } from "vitest";

import { muscleWindow } from "./muscle-window";

const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
// Wednesday 18 November 2026; weeks start on Monday, so this week began on the 16th.
const now = new Date("2026-11-18T12:00:00Z");

describe("muscleWindow", () => {
  it("is the current week for a single week", () => {
    expect(muscleWindow(now, "UTC", "monday", 0, 1)).toEqual({
      start: day("2026-11-16"),
      end: day("2026-11-23"),
    });
  });
  it("steps back a week at a time", () => {
    expect(muscleWindow(now, "UTC", "monday", 2, 1).start).toBe(day("2026-11-02"));
  });
  it("is four whole weeks ending last week, not including the current one", () => {
    expect(muscleWindow(now, "UTC", "monday", 0, 4)).toEqual({
      start: day("2026-10-19"),
      end: day("2026-11-16"),
    });
  });
  it("moves four-week windows back by whole weeks", () => {
    expect(muscleWindow(now, "UTC", "monday", 1, 4).end).toBe(day("2026-11-09"));
  });
});
