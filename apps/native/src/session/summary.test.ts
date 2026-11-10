import { describe, expect, it } from "vitest";

import { allTicked, doneSummary, formatVolume, progressText, type SummarySet } from "./summary";

const done = "2026-01-01T10:00:00.000Z";
const set = (overrides: Partial<SummarySet>): SummarySet => ({
  kind: "working",
  completedAt: done,
  weightKg: 60,
  reps: 8,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  ...overrides,
});

describe("progress", () => {
  it("counts ticked over all sets", () => {
    const sets = [set({}), set({ completedAt: null })];
    expect(progressText(sets)).toBe("1/2");
    expect(allTicked(sets)).toBe(false);
    expect(allTicked([set({})])).toBe(true);
    expect(allTicked([])).toBe(false);
  });
});

describe("doneSummary", () => {
  it("groups consecutive sets of one weight and leaves warm-ups out", () => {
    const sets = [
      set({ kind: "warmup", weightKg: 40, reps: 10 }),
      set({ reps: 8 }),
      set({ reps: 8 }),
      set({ reps: 7 }),
      set({ weightKg: 62.5, reps: 6 }),
      set({ completedAt: null }),
    ];
    expect(doneSummary(sets, "weight_reps", "kg", "kg")).toBe("60 kg × 8, 8, 7 · 62.5 kg × 6");
    expect(doneSummary([], "weight_reps", "kg", "kg")).toBe("");
  });

  it("lists each set for the other types", () => {
    expect(doneSummary([set({ reps: 12 }), set({ reps: 10 })], "reps_only", "kg", "kg")).toBe(
      "12, 10",
    );
    expect(
      doneSummary([set({ durationS: 30 }), set({ durationS: 45 })], "duration", "kg", "kg"),
    ).toBe("0:30, 0:45");
    expect(
      doneSummary([set({ distanceM: 1000, durationS: 300 })], "distance_duration", "kg", "kg"),
    ).toBe("1000 · 5:00");
  });
});

describe("formatVolume", () => {
  it("separates thousands and converts to the user's unit", () => {
    expect(formatVolume(4250, "kg", "en")).toBe("4,250");
    expect(formatVolume(1000, "lb", "en")).toBe("2,205");
    expect(formatVolume(0, "kg", "en")).toBe("0");
  });
});
