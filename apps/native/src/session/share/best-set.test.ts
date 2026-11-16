import { describe, expect, it } from "vitest";

import { bestSet, formatDetail, rowDetail, type BestLabels } from "./best-set";

const set = (values: Partial<Parameters<typeof bestSet>[1][number]>) => ({
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  ...values,
});

const labels: BestLabels = {
  unit: "kg",
  unitLabel: "kg",
  reps: (n) => `${n} reps`,
  distance: (m) => `${m} m`,
  floors: (n) => `${n} floors`,
  steps: (n) => `${n} steps`,
  repRange: (min, max) => (min === max ? `${min} reps` : `${min}–${max} reps`),
  weightReps: (weight, reps) => `${weight} kg × ${reps}`,
};

describe("best set", () => {
  it("is the heaviest for weight and reps, then the most reps", () => {
    const best = bestSet("weight_reps", [
      set({ weightKg: 80, reps: 8 }),
      set({ weightKg: 100, reps: 3 }),
      set({ weightKg: 100, reps: 5 }),
    ]);
    expect(best).toMatchObject({ weightKg: 100, reps: 5 });
  });

  it("has nothing without counted sets", () => {
    expect(bestSet("weight_reps", [])).toBeNull();
    expect(rowDetail("weight_reps", [], true)).toBeNull();
  });

  it("never carries bodyweight or assistance: those types show reps", () => {
    expect(
      bestSet("bodyweight_reps", [set({ reps: 10, weightKg: 82 }), set({ reps: 12 })]),
    ).toEqual(expect.objectContaining({ reps: 12, weightKg: null }));
    expect(bestSet("bodyweight_assisted_reps", [set({ reps: 8, weightKg: 30 })])).toEqual(
      expect.objectContaining({ reps: 8, weightKg: null }),
    );
  });

  it("is the longest for duration and distance types", () => {
    expect(bestSet("duration", [set({ durationS: 30 }), set({ durationS: 60 })])?.durationS).toBe(
      60,
    );
    expect(
      bestSet("distance_duration", [
        set({ distanceM: 2000, durationS: 600 }),
        set({ distanceM: 2000, durationS: 540 }),
        set({ distanceM: 1500, durationS: 900 }),
      ]),
    ).toMatchObject({ distanceM: 2000, durationS: 600 });
  });

  it("treats a weight of 0 as no weight", () => {
    expect(bestSet("weight_reps", [set({ weightKg: 0, reps: 12 })])).toMatchObject({
      weightKg: null,
      reps: 12,
    });
  });
});

describe("row detail", () => {
  const sets = [
    set({ weightKg: 100, reps: 5 }),
    set({ weightKg: 90, reps: 8 }),
    set({ weightKg: 90, reps: 6 }),
  ];

  it("writes the best set with weights", () => {
    const detail = rowDetail("weight_reps", sets, true);
    expect(detail && formatDetail(detail, labels)).toBe("100 kg × 5");
  });

  it("writes a weighted bodyweight best by its added load, with a plus", () => {
    const weighted = [set({ weightKg: 20, reps: 5 }), set({ weightKg: 10, reps: 10 })];
    const detail = rowDetail("bodyweight_weighted_reps", weighted, true);
    expect(detail && formatDetail(detail, labels)).toBe("+20 kg × 5");
    expect(rowDetail("bodyweight_weighted_reps", weighted, false)).toEqual({
      kind: "reps",
      min: 5,
      max: 10,
    });
    // No added load is a plain bodyweight set: reps only.
    const plain = rowDetail("bodyweight_weighted_reps", [set({ weightKg: 0, reps: 12 })], true);
    expect(plain && formatDetail(plain, labels)).toBe("12 reps");
  });

  it("writes the rep range with weights off", () => {
    const detail = rowDetail("weight_reps", sets, false);
    expect(detail).toEqual({ kind: "reps", min: 5, max: 8 });
    expect(detail && formatDetail(detail, labels)).toBe("5–8 reps");
  });

  it("collapses a range of one value", () => {
    const detail = rowDetail("weight_reps", [set({ weightKg: 60, reps: 10 })], false);
    expect(detail && formatDetail(detail, labels)).toBe("10 reps");
  });

  it("leaves a weight out of other types when weights are off", () => {
    const detail = rowDetail(
      "short_distance_weight",
      [set({ weightKg: 100, distanceM: 20 })],
      false,
    );
    expect(detail && formatDetail(detail, labels)).toBe("20 m");
  });

  it("formats duration, distance and reps-only bests", () => {
    expect(formatDetail(rowDetail("duration", [set({ durationS: 75 })], true)!, labels)).toBe(
      "1:15",
    );
    expect(
      formatDetail(
        rowDetail("distance_duration", [set({ distanceM: 2000, durationS: 510 })], true)!,
        labels,
      ),
    ).toBe("2000 m · 8:30");
    expect(formatDetail(rowDetail("reps_only", [set({ reps: 12 })], true)!, labels)).toBe(
      "12 reps",
    );
  });

  it("keeps a weight without reps as the weight alone", () => {
    expect(formatDetail(rowDetail("weight_reps", [set({ weightKg: 40 })], true)!, labels)).toBe(
      "40 kg",
    );
  });
});
