import { describe, expect, it } from "vitest";

import {
  joinDuration,
  notAfter,
  onDay,
  recentDays,
  sameDay,
  splitDuration,
  stepDuration,
  stepStart,
} from "./save-time";

const MAX = 86_400;

describe("duration", () => {
  it("splits and joins hours and minutes", () => {
    expect(splitDuration(3_725)).toEqual({ hours: 1, minutes: 2 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
    expect(joinDuration(1, 2, MAX)).toBe(3_720);
    expect(joinDuration(30, 0, MAX)).toBe(MAX);
  });
  it("steps within zero and the maximum", () => {
    expect(stepDuration(3_600, "hour", -1, MAX)).toBe(0);
    expect(stepDuration(0, "minute", -1, MAX)).toBe(0);
    expect(stepDuration(3_660, "minute", 1, MAX)).toBe(3_720);
    expect(stepDuration(MAX, "hour", 1, MAX)).toBe(MAX);
  });
});

describe("start time", () => {
  const now = new Date(2026, 10, 12, 16, 30, 0);
  it("lists today first and the days before it", () => {
    const days = recentDays(now, 3);
    expect(days.map((d) => d.getDate())).toEqual([12, 11, 10]);
    expect(sameDay(days[0] ?? now, now)).toBe(true);
  });
  it("keeps the time of day when the day changes", () => {
    const moved = onDay(new Date(2026, 10, 12, 7, 45, 10), new Date(2026, 10, 9));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([9, 7, 45]);
  });
  it("carries minutes across the hour and refuses the future", () => {
    const at = new Date(2026, 10, 12, 8, 59, 0);
    expect(stepStart(at, "minute", 1, now).getHours()).toBe(9);
    expect(stepStart(new Date(2026, 10, 12, 16, 29, 0), "hour", 1, now).getTime()).toBe(
      now.getTime(),
    );
    expect(notAfter(new Date(2027, 0, 1), now).getTime()).toBe(now.getTime());
  });
});
