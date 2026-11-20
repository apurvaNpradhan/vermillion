import { describe, expect, it } from "vitest";

import { groupParts } from "./muscle-parts";

const loads = [
  {
    muscle: "shoulders",
    parts: [
      { detail: "front_delts", sets: 9 },
      { detail: "side_delts", sets: 3 },
      { detail: "unspecified", sets: 2 },
    ],
  },
  { muscle: "chest", parts: [{ detail: "unspecified", sets: 4 }] },
] as const;

describe("groupParts", () => {
  it("lists the parts of a group with details, unspecified last", () => {
    expect(groupParts(loads, "shoulders")).toEqual(loads[0].parts);
  });

  it("averages over weeks", () => {
    expect(groupParts(loads, "shoulders", 4)[0]).toEqual({ detail: "front_delts", sets: 2.25 });
  });

  it("shows nothing when only unspecified, or the group has no sets", () => {
    expect(groupParts(loads, "chest")).toEqual([]);
    expect(groupParts(loads, "calves")).toEqual([]);
  });
});
