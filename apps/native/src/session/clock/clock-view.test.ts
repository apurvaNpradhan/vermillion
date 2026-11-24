import { describe, expect, it } from "vitest";

import { START_PROBLEM_KEYS, firstTickedAt, latestStartMs } from "./clock-view";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

describe("firstTickedAt", () => {
  it("is the earliest completion across exercises, or null before the first tick", () => {
    expect(firstTickedAt({ exercises: [{ sets: [{ completedAt: null }] }] })).toBeNull();
    expect(
      firstTickedAt({
        exercises: [
          { sets: [{ completedAt: at(300) }, { completedAt: null }] },
          { sets: [{ completedAt: at(120) }] },
        ],
      }),
    ).toBe(at(120));
  });
});

describe("latestStartMs", () => {
  it("is now when nothing limits it", () => {
    expect(latestStartMs({ nowMs: T0, firstTickedAt: null, pausedAt: null })).toBe(T0);
  });
  it("stops at the first tick and at the pause, whichever is earlier", () => {
    expect(latestStartMs({ nowMs: T0 + 9000, firstTickedAt: at(5), pausedAt: at(7) })).toBe(
      T0 + 5000,
    );
    expect(latestStartMs({ nowMs: T0 + 9000, firstTickedAt: at(8), pausedAt: at(7) })).toBe(
      T0 + 7000,
    );
  });
});

describe("START_PROBLEM_KEYS", () => {
  it("has a message for every problem", () => {
    expect(Object.keys(START_PROBLEM_KEYS).sort()).toEqual(
      ["after-pause", "after-tick", "future", "invalid", "too-old"].sort(),
    );
  });
});
