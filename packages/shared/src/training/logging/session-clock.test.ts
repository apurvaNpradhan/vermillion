import { describe, expect, it } from "vitest";

import {
  PAUSE_AUTO_RESUME_MS,
  checkStartEdit,
  finishClock,
  pauseClock,
  pauseExpired,
  resumeClock,
  sessionActiveMs,
  sessionActiveSeconds,
  sessionDurationSeconds,
  shiftForPause,
  type SessionClock,
} from "./session-clock";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const running: SessionClock = { startedAt: at(0), pausedAt: null, pausedMs: 0 };

describe("sessionActiveMs", () => {
  it("is the time since the start while running", () => {
    expect(sessionActiveMs(running, T0 + 90_500)).toBe(90_500);
    expect(sessionActiveSeconds(running, T0 + 90_500)).toBe(90);
  });

  it("subtracts settled pauses", () => {
    expect(sessionActiveSeconds({ ...running, pausedMs: 30_000 }, T0 + 90_000)).toBe(60);
  });

  it("freezes while paused", () => {
    const paused = { ...running, pausedAt: at(60) };
    expect(sessionActiveSeconds(paused, T0 + 60_000)).toBe(60);
    expect(sessionActiveSeconds(paused, T0 + 600_000)).toBe(60);
  });

  it("combines a settled and an open pause", () => {
    const clock = { startedAt: at(0), pausedAt: at(100), pausedMs: 20_000 };
    expect(sessionActiveSeconds(clock, T0 + 500_000)).toBe(80);
  });

  it("never goes negative", () => {
    expect(sessionActiveMs(running, T0 - 5000)).toBe(0);
    expect(sessionActiveMs({ ...running, pausedMs: 10 ** 9 }, T0 + 1000)).toBe(0);
    expect(sessionActiveMs({ ...running, startedAt: "nope" }, T0)).toBe(0);
  });
});

describe("sessionDurationSeconds", () => {
  const base = { durationS: null, startedAt: at(0), finishedAt: at(1000) };
  it("prefers the user's override", () => {
    expect(sessionDurationSeconds({ ...base, durationS: 300 }, T0)).toBe(300);
  });
  it("is start to finish for a Session with no pauses recorded", () => {
    expect(sessionDurationSeconds(base, T0 + 10_000_000)).toBe(1000);
  });
  it("leaves the paused time out", () => {
    expect(sessionDurationSeconds({ ...base, pausedMs: 400_000 }, T0)).toBe(600);
  });
  it("runs to now while unfinished and paused", () => {
    expect(
      sessionDurationSeconds(
        { durationS: null, startedAt: at(0), finishedAt: null, pausedAt: at(120) },
        T0 + 900_000,
      ),
    ).toBe(120);
  });
});

describe("pause and resume", () => {
  it("pauses once and keeps the first pause time", () => {
    const paused = pauseClock(running, T0 + 60_000);
    expect(paused.pausedAt).toBe(at(60));
    expect(pauseClock(paused, T0 + 90_000)).toBe(paused);
  });

  it("resume adds the span to pausedMs and clears pausedAt", () => {
    const paused = pauseClock(running, T0 + 60_000);
    const { clock, spanMs } = resumeClock(paused, T0 + 150_000);
    expect(spanMs).toBe(90_000);
    expect(clock).toEqual({ startedAt: at(0), pausedAt: null, pausedMs: 90_000 });
    expect(sessionActiveSeconds(clock, T0 + 150_000)).toBe(60);
  });

  it("resuming a running clock changes nothing", () => {
    expect(resumeClock(running, T0 + 5000)).toEqual({ clock: running, spanMs: 0 });
  });

  it("accumulates across several pauses", () => {
    let clock = pauseClock(running, T0 + 10_000);
    clock = resumeClock(clock, T0 + 30_000).clock;
    clock = pauseClock(clock, T0 + 50_000);
    clock = resumeClock(clock, T0 + 100_000).clock;
    expect(clock.pausedMs).toBe(70_000);
    expect(sessionActiveSeconds(clock, T0 + 100_000)).toBe(30);
  });

  it("finishing while paused counts the open pause as paused", () => {
    const paused = pauseClock(running, T0 + 60_000);
    const finished = finishClock(paused, T0 + 300_000);
    expect(finished.pausedAt).toBeNull();
    expect(sessionActiveSeconds(finished, T0 + 300_000)).toBe(60);
  });

  it("is auto-resumed after four hours", () => {
    const paused = pauseClock(running, T0);
    expect(pauseExpired(paused, T0 + PAUSE_AUTO_RESUME_MS - 1)).toBe(false);
    expect(pauseExpired(paused, T0 + PAUSE_AUTO_RESUME_MS)).toBe(true);
    expect(pauseExpired(running, T0 + PAUSE_AUTO_RESUME_MS * 2)).toBe(false);
  });
});

describe("shiftForPause", () => {
  const rest = { startedAt: at(100), endsAt: at(190) };
  it("moves a countdown that was running by the paused span", () => {
    expect(shiftForPause(rest, T0 + 130_000, 60_000)).toEqual({
      startedAt: at(160),
      endsAt: at(250),
    });
  });
  it("leaves a countdown that had already ended", () => {
    expect(shiftForPause(rest, T0 + 200_000, 60_000)).toBe(rest);
  });
  it("leaves it when nothing was paused", () => {
    expect(shiftForPause(rest, T0 + 130_000, 0)).toBe(rest);
  });
});

describe("checkStartEdit", () => {
  const input = {
    nowMs: T0 + 3_600_000,
    firstTickedAt: at(1800),
    pausedAt: null,
    earliestMs: T0 - 86_400_000 * 365,
  };
  it("accepts a start before now and before the first tick", () => {
    expect(checkStartEdit({ ...input, candidate: at(600) })).toBeNull();
    expect(checkStartEdit({ ...input, candidate: at(1800) })).toBeNull();
  });
  it("refuses the future, a start after the first tick and garbage", () => {
    expect(checkStartEdit({ ...input, candidate: at(3601) })).toBe("future");
    expect(checkStartEdit({ ...input, candidate: at(1801) })).toBe("after-tick");
    expect(checkStartEdit({ ...input, candidate: "x" })).toBe("invalid");
  });
  it("allows any past start while nothing is ticked", () => {
    expect(checkStartEdit({ ...input, firstTickedAt: null, candidate: at(3000) })).toBeNull();
  });
  it("refuses a start after the current pause began", () => {
    expect(
      checkStartEdit({ ...input, firstTickedAt: null, pausedAt: at(500), candidate: at(600) }),
    ).toBe("after-pause");
  });
  it("refuses a start before the backfill window", () => {
    expect(checkStartEdit({ ...input, candidate: at(-86_400 * 400) })).toBe("too-old");
  });
});
