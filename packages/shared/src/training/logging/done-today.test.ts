import { describe, expect, it } from "vitest";

import { finishedToday } from "./done-today";

const finished = (workout_id: string | null, finished_at: string, title = "Upper A") => ({
  workout_id,
  finished_at,
  title,
});

describe("finishedToday", () => {
  const now = new Date("2026-11-27T15:00:00Z");

  it("finds a Session of the Workout finished earlier the same local day", () => {
    expect(finishedToday([finished("w1", "2026-11-27T07:30:00Z")], "w1", now, "UTC")?.title).toBe(
      "Upper A",
    );
  });

  it("ignores other Workouts and other days", () => {
    expect(finishedToday([finished("w2", "2026-11-27T07:30:00Z")], "w1", now, "UTC")).toBeNull();
    expect(finishedToday([finished("w1", "2026-11-26T20:00:00Z")], "w1", now, "UTC")).toBeNull();
    expect(finishedToday([], "w1", now, "UTC")).toBeNull();
  });

  it("reads the day in the user's time zone", () => {
    // 2026-11-27 02:00 in Kolkata is still the 26th in UTC.
    const early = new Date("2026-11-27T02:00:00+05:30");
    expect(
      finishedToday([finished("w1", "2026-11-26T22:00:00Z")], "w1", early, "Asia/Kolkata"),
    ).not.toBeNull();
    expect(
      finishedToday([finished("w1", "2026-11-26T22:00:00Z")], "w1", early, "UTC"),
    ).not.toBeNull();
    expect(
      finishedToday([finished("w1", "2026-11-26T17:00:00Z")], "w1", early, "Asia/Kolkata"),
    ).toBeNull();
  });

  it("returns the latest of several", () => {
    expect(
      finishedToday(
        [
          finished("w1", "2026-11-27T06:00:00Z", "Early"),
          finished("w1", "2026-11-27T09:00:00Z", "Late"),
        ],
        "w1",
        now,
        "UTC",
      )?.title,
    ).toBe("Late");
  });
});
