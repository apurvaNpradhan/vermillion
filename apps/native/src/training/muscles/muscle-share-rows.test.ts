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

  it("formats a whole percent", () => {
    expect(formatPercent(34, "en")).toBe("34%");
    expect(formatPercent(0, "en")).toBe("0%");
  });

  it("rounds the whole distribution to 100, even when only the top is shown", () => {
    const even = muscleShares(
      [
        { muscle: "chest", sets: 1 },
        { muscle: "lats", sets: 1 },
        { muscle: "biceps", sets: 1 },
      ],
      [],
    );
    expect(groupRows(even).map((row) => row.percent)).toEqual([34, 33, 33]);
    expect(groupRows(even, 2).map((row) => row.percent)).toEqual([34, 33]);
  });

  it("can round a tiny share to 0% while the full distribution totals 100%", () => {
    const skew = muscleShares(
      [
        { muscle: "chest", sets: 1000 },
        { muscle: "biceps", sets: 1 },
      ],
      [],
    );
    const rows = groupRows(skew);
    expect(rows.map((row) => row.percent)).toEqual([100, 0]);
  });

  it("keeps sets without a detail in the Details denominator", () => {
    const rows = detailRows(shares);
    // 8 of 10 sets name upper chest; the biceps sets name no detail, so the page does not reach 100.
    expect(rows.map((row) => row.percent)).toEqual([80]);
    const thirds = muscleShares(
      [
        { muscle: "chest", sets: 2 },
        { muscle: "biceps", sets: 1 },
      ],
      [
        {
          muscle: "chest",
          parts: [
            { detail: "upper_chest", sets: 1 },
            { detail: "lower_chest", sets: 1 },
          ],
        },
        { muscle: "biceps", parts: [{ detail: "unspecified", sets: 1 }] },
      ],
    );
    const percents = detailRows(thirds).map((row) => row.percent);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(67);
  });
});
