import { describe, expect, it } from "vitest";

import { splitShares } from "./muscle-split";

describe("splitShares", () => {
  it("gives shares of the total and bar widths relative to the biggest muscle", () => {
    expect(
      splitShares([
        { muscle: "lats", sets: 6 },
        { muscle: "biceps", sets: 3 },
        { muscle: "shoulders", sets: 3 },
      ]),
    ).toEqual([
      { muscle: "lats", percent: 50, width: 1 },
      { muscle: "biceps", percent: 25, width: 0.5 },
      { muscle: "shoulders", percent: 25, width: 0.5 },
    ]);
  });
  it("handles no sets", () => {
    expect(splitShares([])).toEqual([]);
  });
});
