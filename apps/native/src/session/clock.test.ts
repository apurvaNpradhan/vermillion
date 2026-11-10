import { describe, expect, it } from "vitest";

import {
  countdownProgress,
  elapsedSeconds,
  formatElapsed,
  remainingSeconds,
  totalSeconds,
} from "./clock";

const at = (iso: string) => Date.parse(iso);
const rest = { startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T10:02:00.000Z" };

describe("elapsed time", () => {
  it("counts whole seconds from started_at and never goes negative", () => {
    expect(elapsedSeconds("2026-01-01T10:00:00.000Z", at("2026-01-01T10:00:05.900Z"))).toBe(5);
    expect(elapsedSeconds("2026-01-01T10:00:00.000Z", at("2026-01-01T09:59:00.000Z"))).toBe(0);
    expect(elapsedSeconds("nonsense", at("2026-01-01T09:59:00.000Z"))).toBe(0);
  });

  it("formats with tabular minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5)).toBe("0:05");
    expect(formatElapsed(750)).toBe("12:30");
    expect(formatElapsed(3723)).toBe("1:02:03");
    expect(formatElapsed(-4)).toBe("0:00");
  });
});

describe("a countdown from timestamps", () => {
  it("counts down from the stored end, rounding up", () => {
    expect(totalSeconds(rest)).toBe(120);
    expect(remainingSeconds(rest, at("2026-01-01T10:00:00.000Z"))).toBe(120);
    expect(remainingSeconds(rest, at("2026-01-01T10:00:30.200Z"))).toBe(90);
    expect(remainingSeconds(rest, at("2026-01-01T10:01:59.100Z"))).toBe(1);
    expect(remainingSeconds(rest, at("2026-01-01T10:02:00.000Z"))).toBe(0);
    expect(remainingSeconds(rest, at("2026-01-01T10:05:00.000Z"))).toBe(0);
  });

  it("survives clock jumps: back never exceeds the set length, forward ends early", () => {
    expect(remainingSeconds(rest, at("2026-01-01T09:00:00.000Z"))).toBe(120);
    expect(remainingSeconds(rest, at("2026-01-02T10:00:00.000Z"))).toBe(0);
    expect(remainingSeconds({ startedAt: "x", endsAt: "y" }, 0)).toBe(0);
  });

  it("reports progress from 0 to 1", () => {
    expect(countdownProgress(rest, at("2026-01-01T10:00:00.000Z"))).toBe(0);
    expect(countdownProgress(rest, at("2026-01-01T10:01:00.000Z"))).toBe(0.5);
    expect(countdownProgress(rest, at("2026-01-01T10:03:00.000Z"))).toBe(1);
    expect(countdownProgress({ startedAt: rest.endsAt, endsAt: rest.endsAt }, 0)).toBe(1);
  });
});
