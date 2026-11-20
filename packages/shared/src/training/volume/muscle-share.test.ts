import { describe, expect, it } from "vitest";

import { muscleShares } from "./muscle-share";

describe("muscleShares", () => {
  const loads = [
    { muscle: "chest", sets: 6 },
    { muscle: "triceps", sets: 3 },
    { muscle: "shoulders", sets: 1 },
  ] as const;
  const details = [
    {
      muscle: "chest",
      parts: [
        { detail: "upper_chest", sets: 4 },
        { detail: "unspecified", sets: 2 },
      ],
    },
    { muscle: "triceps", parts: [{ detail: "unspecified", sets: 3 }] },
    { muscle: "shoulders", parts: [{ detail: "front_delts", sets: 1 }] },
  ] as const;

  it("divides by the sum of the group loads, so the groups add up to 1", () => {
    const result = muscleShares(loads, details);
    expect(result.total).toBe(10);
    expect(result.groups.map((group) => group.share)).toEqual([0.6, 0.3, 0.1]);
    expect(result.groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1);
  });

  it("ranks details across groups and leaves unspecified sets out", () => {
    const result = muscleShares(loads, details);
    expect(result.details.map((part) => [part.detail, part.muscle, part.share])).toEqual([
      ["upper_chest", "chest", 0.4],
      ["front_delts", "shoulders", 0.1],
    ]);
    expect(result.groups[1]?.parts).toEqual([]);
  });

  it("has no shares without sets", () => {
    expect(muscleShares([], [])).toEqual({ total: 0, groups: [], details: [] });
  });
});
