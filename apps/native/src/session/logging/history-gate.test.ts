import { describe, expect, it } from "vitest";

import { hasRequiredSetValues, historySettled } from "./history-gate";

describe("historySettled", () => {
  it("waits only while the lookup is still loading", () => {
    expect(historySettled({ loaded: false, failed: false })).toBe(false);
    expect(historySettled({ loaded: true, failed: false })).toBe(true);
  });

  it("lets a set be ticked when the lookup failed and the exercise has no history entry", () => {
    // `usePreviousSets` reports an empty map on failure, so `loaded` (map.has) is false.
    expect(historySettled({ loaded: false, failed: true })).toBe(true);
  });
});

describe("hasRequiredSetValues", () => {
  it("allows a complete entry before Previous arrives, including zero added weight", () => {
    expect(
      hasRequiredSetValues("bodyweight_weighted_reps", (field) => (field === "weight" ? 0 : 8)),
    ).toBe(true);
  });

  it("keeps completion waiting when a required value is empty", () => {
    expect(hasRequiredSetValues("weight_reps", (field) => (field === "reps" ? 0 : 60))).toBe(false);
    expect(hasRequiredSetValues("weight_reps", (field) => (field === "weight" ? null : 8))).toBe(
      false,
    );
  });
});
