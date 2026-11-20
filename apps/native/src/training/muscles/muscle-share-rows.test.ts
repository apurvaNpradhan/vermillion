import { muscleShares } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { detailRows, formatPercent, groupRows, hasDetails, toneOf } from "./muscle-share-rows";

const shares = muscleShares(
  [
    { muscle: "chest", sets: 8 },
    { muscle: "biceps", sets: 2 },
  ],
  [
    { muscle: "chest", parts: [{ detail: "upper_chest", sets: 8 }] },
    { muscle: "biceps", parts: [{ detail: "unspecified", sets: 2 }] },
  ],
);

describe("muscle share rows", () => {
  it("lists groups biggest first and can be cut to the top", () => {
    expect(groupRows(shares).map((row) => [row.key, row.share])).toEqual([
      ["chest", 0.8],
      ["biceps", 0.2],
    ]);
    expect(groupRows(shares, 1)).toHaveLength(1);
  });

  it("colours a detail like its group", () => {
    const [row] = detailRows(shares);
    expect(row?.detail).toBe("upper_chest");
    expect(row?.tone).toBe(toneOf("chest"));
    expect(hasDetails(shares)).toBe(true);
  });

  it("formats percentages, never rounding a present muscle to zero", () => {
    expect(formatPercent(0.336, "en")).toBe("34%");
    expect(formatPercent(0.002, "en")).toBe("1%");
    expect(formatPercent(0, "en")).toBe("0%");
  });
});
