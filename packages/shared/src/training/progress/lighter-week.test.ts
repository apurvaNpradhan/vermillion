import { describe, expect, it } from "vitest";

import {
  LIGHTER_WEEKS_KEPT,
  activeLighterWeek,
  endLighterWeek,
  inLighterWeek,
  optionalSetIndexes,
  outsideLighterWeeks,
  startLighterWeek,
} from "./lighter-week";

const NOW = new Date("2026-11-16T12:00:00.000Z");

describe("Lighter week", () => {
  it("starts for seven days and is active only inside its period", () => {
    const { deloadUntil, lighterWeeks } = startLighterWeek([], NOW);
    expect(deloadUntil).toBe("2026-11-23T12:00:00.000Z");
    expect(lighterWeeks).toEqual([{ from: NOW.toISOString(), until: deloadUntil }]);
    expect(activeLighterWeek(lighterWeeks, NOW)).not.toBeNull();
    expect(activeLighterWeek(lighterWeeks, new Date("2026-11-23T12:00:00.000Z"))).toBeNull();
    expect(activeLighterWeek(lighterWeeks, new Date("2026-11-15T12:00:00.000Z"))).toBeNull();
  });

  it("ends early: the period stops counting from that moment and keeps the earlier part", () => {
    const { lighterWeeks } = startLighterWeek([], NOW);
    const later = new Date("2026-11-18T12:00:00.000Z");
    const ended = endLighterWeek(lighterWeeks, later);
    expect(ended.deloadUntil).toBeNull();
    expect(ended.lighterWeeks[0]?.until).toBe(later.toISOString());
    expect(activeLighterWeek(ended.lighterWeeks, later)).toBeNull();
    expect(inLighterWeek("2026-11-17T10:00:00.000Z", ended.lighterWeeks)).toBe(true);
    expect(inLighterWeek("2026-11-19T10:00:00.000Z", ended.lighterWeeks)).toBe(false);
  });

  it("keeps a bounded history, newest last", () => {
    const many = Array.from({ length: LIGHTER_WEEKS_KEPT + 3 }, (_, index) => ({
      from: new Date(2025, 0, 1 + index).toISOString(),
      until: new Date(2025, 0, 2 + index).toISOString(),
    }));
    const { lighterWeeks } = startLighterWeek(many, NOW);
    expect(lighterWeeks).toHaveLength(LIGHTER_WEEKS_KEPT);
    expect(lighterWeeks.at(-1)?.from).toBe(NOW.toISOString());
  });

  it("filters out the Sessions that started inside a period", () => {
    const week = { from: "2026-11-09T00:00:00.000Z", until: "2026-11-16T00:00:00.000Z" };
    const sessions = [
      { started_at: "2026-11-17T10:00:00.000Z" },
      { started_at: "2026-11-12T10:00:00.000Z" },
      { started_at: "2026-11-05T10:00:00.000Z" },
    ];
    expect(outsideLighterWeeks(sessions, [week]).map((s) => s.started_at)).toEqual([
      "2026-11-17T10:00:00.000Z",
      "2026-11-05T10:00:00.000Z",
    ]);
  });

  it("leaves about half of the working sets as suggested and the rest optional", () => {
    expect([...optionalSetIndexes(["working", "working", "working", "working"])]).toEqual([2, 3]);
    expect([...optionalSetIndexes(["warmup", "working", "working", "working"])]).toEqual([3]);
    expect([...optionalSetIndexes(["working"])]).toEqual([]);
    expect([...optionalSetIndexes(["working", "working"])]).toEqual([1]);
  });
});
