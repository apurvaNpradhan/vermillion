import { phasePlanSchema } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { stripBlocks } from "./phase-strip-math";

const plan = phasePlanSchema.parse({ pattern: ["build", "build", "build", "deload"] });

const current = (week: number, inserts: number[] = []) => ({
  run: { started_at: "2026-01-01T12:00:00Z", inserted_deloads: inserts },
  now: new Date(Date.UTC(2026, 0, 1 + (week - 1) * 7, 12)),
  timeZone: "UTC",
});

describe("stripBlocks", () => {
  it("draws the planned weeks, each with its phase", () => {
    const blocks = stripBlocks({ plan, current: current(1), plannedWeeks: 8 });
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
    const states = (week: number | null) =>
      stripBlocks({
        plan,
        current: week === null ? undefined : current(week),
        plannedWeeks: 5,
      }).map((block) => block.state);
    expect(states(3)).toEqual(["past", "past", "current", "future", "future"]);
    expect(states(null)).toEqual(["future", "future", "future", "future", "future"]);
  });

  it("makes a block as tall as its phase is hard", () => {
    const heights = (phase: "deload" | "build" | "push" | "test") =>
      stripBlocks({
        plan: phasePlanSchema.parse({ pattern: [phase] }),
        plannedWeeks: 1,
      })[0]?.height;
    expect(heights("test")).toBe(1);
    expect(heights("deload")).toBeLessThan(heights("build") ?? 0);
    expect(heights("build")).toBeLessThan(heights("push") ?? 0);
    expect(heights("push")).toBeLessThan(heights("test") ?? 0);
  });

  it("replaces the planned Deload without adding weeks to the strip", () => {
    const blocks = stripBlocks({ plan, current: current(2, [2]), plannedWeeks: 4 });
    expect(blocks).toHaveLength(4);
    expect(blocks[1]).toMatchObject({ phase: "deload", inserted: true, state: "current" });
    expect(blocks.map((block) => block.programWeek)).toEqual([1, 2, 5, 6]);
    expect(blocks[3]?.phase).toBe("build");
  });

  it("an overridden week shows its own phase", () => {
    const edited = phasePlanSchema.parse({
      pattern: ["build"],
      overrides: [{ week: 3, phase: "test" }],
    });
    const blocks = stripBlocks({
      plan: edited,
      current: current(1),
      plannedWeeks: 4,
    });
    expect(blocks[2]?.phase).toBe("test");
  });

  it("an open-ended Program shows twelve weeks, and a few past the current one", () => {
    expect(stripBlocks({ plan, current: current(2), plannedWeeks: null })).toHaveLength(12);
    expect(stripBlocks({ plan, current: current(20), plannedWeeks: null })).toHaveLength(24);
  });

  it("shows Build for a current Test week after a training break", () => {
    const blocks = stripBlocks({
      plan: phasePlanSchema.parse({ pattern: ["build", "build", "test"] }),
      current: { ...current(3), trainedAt: ["2026-01-01T12:00:00Z"] },
      plannedWeeks: 6,
    });
    expect(blocks[2]).toMatchObject({ phase: "build", state: "current" });
    expect(blocks[5]).toMatchObject({ phase: "test", state: "future" });
  });

  it("keeps the current week on the strip after the planned weeks have passed", () => {
    const blocks = stripBlocks({ plan, current: current(6), plannedWeeks: 4 });
    expect(blocks).toHaveLength(6);
    expect(blocks[5]?.state).toBe("current");
  });

  it("keeps recorded phases in past weeks after a pattern and length change", () => {
    const changed = phasePlanSchema.parse({ pattern: ["push"] });
    const blocks = stripBlocks({
      plan: changed,
      plannedWeeks: 1,
      current: {
        ...current(3),
        history: [
          { started_at: "2026-01-15T12:00:00Z", phase: "test" },
          { started_at: "2026-01-09T12:00:00Z", phase: "deload" },
          { started_at: "2026-01-08T12:00:00Z", phase: "build" },
        ],
      },
    });
    expect(blocks[1]).toMatchObject({ phase: "deload", trained: true, state: "past" });
    expect(blocks[2]).toMatchObject({ phase: "push", trained: false, state: "current" });
  });

  it("keeps a long-running Program's current week inside the open-ended preview", () => {
    const blocks = stripBlocks({ plan, current: current(110), plannedWeeks: null });
    expect(blocks.find((block) => block.state === "current")?.week).toBe(110);
    expect(blocks.at(-1)?.week).toBe(114);
  });

  it("shows later week edits again when reopening a shortened plan", () => {
    const edited = phasePlanSchema.parse({
      pattern: ["build"],
      overrides: [{ week: 18, phase: "test" }],
    });
    expect(stripBlocks({ plan: edited, plannedWeeks: 6 })).toHaveLength(6);
    expect(stripBlocks({ plan: edited, plannedWeeks: null }).at(-1)).toMatchObject({
      week: 18,
      phase: "test",
    });
  });
});
