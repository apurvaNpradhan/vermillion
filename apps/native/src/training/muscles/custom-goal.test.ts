import { describe, expect, it } from "vitest";

import { customGoal } from "./custom-goal";

describe("customGoal", () => {
  it("builds a Custom goal from two whole numbers", () => {
    expect(customGoal("4", "12")).toEqual({ level: "custom", min: 4, max: 12 });
    expect(customGoal("8", "8")).toEqual({ level: "custom", min: 8, max: 8 });
  });

  it.each([
    ["", "10"],
    ["5", ""],
    ["a", "10"],
    ["5.5", "10"],
    ["12", "8"],
    ["5", "0"],
    ["5", "99"],
  ])("rejects %j to %j", (min, max) => {
    expect(customGoal(min, max)).toBeNull();
  });
});
