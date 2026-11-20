import { describe, expect, it } from "vitest";

import { historySettled } from "./history-gate";

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
