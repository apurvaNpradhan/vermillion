import { phasePlanSchema } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { stripBlocks } from "./phase-strip-math";

const plan = phasePlanSchema.parse({ pattern: ["build", "build", "build", "deload"] });

describe("stripBlocks", () => {
  it("draws the planned weeks, each with its phase", () => {
    const blocks = stripBlocks({ plan, insertedDeloads: [], currentWeek: 1, plannedWeeks: 8 });
    expect(blocks.map((block) => block.phase)).toEqual([
      "build",
      "build",
      "build",
      "deload",
      "build",
      "build",
      "build",
      "deload",
    ]);
  });

  it("marks past, current and future weeks, and none current without a Run", () => {
    const states = (current: number | null) =>
      stripBlocks({ plan, insertedDeloads: [], currentWeek: current, plannedWeeks: 5 }).map(
        (block) => block.state,
      );
    expect(states(3)).toEqual(["past", "past", "current", "future", "future"]);
    expect(states(null)).toEqual(["future", "future", "future", "future", "future"]);
  });

  it("makes a block as tall as its phase is hard", () => {
    const heights = (phase: "deload" | "build" | "push" | "test") =>
      stripBlocks({
        plan: phasePlanSchema.parse({ pattern: [phase] }),
        insertedDeloads: [],
        currentWeek: null,
        plannedWeeks: 1,
      })[0]?.height;
    expect(heights("test")).toBe(1);
    expect(heights("deload")).toBeLessThan(heights("build") ?? 0);
    expect(heights("build")).toBeLessThan(heights("push") ?? 0);
    expect(heights("push")).toBeLessThan(heights("test") ?? 0);
  });

  it("adds a week for each inserted Deload and shifts the weeks after it", () => {
    const blocks = stripBlocks({ plan, insertedDeloads: [2], currentWeek: 2, plannedWeeks: 4 });
    expect(blocks).toHaveLength(5);
    expect(blocks[1]).toMatchObject({ phase: "deload", inserted: true, state: "current" });
    expect(blocks.map((block) => block.programWeek)).toEqual([1, 2, 2, 3, 4]);
    expect(blocks[4]?.phase).toBe("deload");
  });

  it("an overridden week shows its own phase", () => {
    const edited = phasePlanSchema.parse({
      pattern: ["build"],
      overrides: [{ week: 3, phase: "test" }],
    });
    const blocks = stripBlocks({
      plan: edited,
      insertedDeloads: [],
      currentWeek: 1,
      plannedWeeks: 4,
    });
    expect(blocks[2]?.phase).toBe("test");
  });

  it("an open-ended Program shows twelve weeks, and a few past the current one", () => {
    expect(
      stripBlocks({ plan, insertedDeloads: [], currentWeek: 2, plannedWeeks: null }),
    ).toHaveLength(12);
    expect(
      stripBlocks({ plan, insertedDeloads: [], currentWeek: 20, plannedWeeks: null }),
    ).toHaveLength(24);
  });

  it("keeps the current week on the strip after the planned weeks have passed", () => {
    const blocks = stripBlocks({ plan, insertedDeloads: [], currentWeek: 6, plannedWeeks: 4 });
    expect(blocks).toHaveLength(6);
    expect(blocks[5]?.state).toBe("current");
  });
});
