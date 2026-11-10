import { describe, expect, it } from "vitest";

import { dueTimers, timerTarget, timerView } from "./duration-timer";

const at = (iso: string) => Date.parse(iso);
const start = "2026-01-01T10:00:00.000Z";

describe("timerTarget", () => {
  it("is the typed value, else the planned target, else none", () => {
    expect(timerTarget({ durationS: 45, target: { duration_s: 30 } })).toBe(45);
    expect(timerTarget({ durationS: null, target: { duration_s: 30 } })).toBe(30);
    expect(timerTarget({ durationS: null, target: {} })).toBeNull();
    expect(timerTarget({ durationS: null, target: null })).toBeNull();
  });
});

describe("timerView", () => {
  it("counts a stopwatch up from the stored start", () => {
    expect(timerView(start, null, at("2026-01-01T10:00:00.900Z"))).toEqual({
      elapsed: 0,
      remaining: null,
      due: false,
    });
    expect(timerView(start, null, at("2026-01-01T10:01:05.000Z")).elapsed).toBe(65);
  });

  it("counts a countdown down and is due at zero, also long after it ended", () => {
    expect(timerView(start, 30, at("2026-01-01T10:00:10.000Z"))).toEqual({
      elapsed: 10,
      remaining: 20,
      due: false,
    });
    expect(timerView(start, 30, at("2026-01-01T10:00:30.000Z")).due).toBe(true);
    expect(timerView(start, 30, at("2026-01-01T12:00:00.000Z"))).toMatchObject({
      remaining: 0,
      due: true,
    });
  });

  it("never reads negative when the clock is set back", () => {
    expect(timerView(start, 30, at("2025-12-31T10:00:00.000Z"))).toEqual({
      elapsed: 0,
      remaining: 30,
      due: false,
    });
    expect(timerView("garbage", null, 5).elapsed).toBe(0);
  });
});

describe("dueTimers", () => {
  const set = (overrides: Partial<Parameters<typeof dueTimers>[0][number]> = {}) => ({
    id: "s1",
    timerStartedAt: start,
    completedAt: null,
    durationS: null,
    target: { duration_s: 30 },
    ...overrides,
  });

  it("lists running countdowns that reached zero with the duration to log", () => {
    const now = at("2026-01-01T10:00:31.000Z");
    expect(dueTimers([set()], now)).toEqual([{ id: "s1", duration: 30 }]);
    expect(dueTimers([set()], at("2026-01-01T10:00:29.000Z"))).toEqual([]);
  });

  it("skips stopwatches, ticked sets and sets with no timer", () => {
    const now = at("2026-01-01T11:00:00.000Z");
    expect(dueTimers([set({ target: null })], now)).toEqual([]);
    expect(dueTimers([set({ completedAt: start })], now)).toEqual([]);
    expect(dueTimers([set({ timerStartedAt: null })], now)).toEqual([]);
  });
});
