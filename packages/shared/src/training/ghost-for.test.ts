import { describe, expect, it } from "vitest";

import { ghostFor } from "./ghost-for";

describe("ghostFor", () => {
  const target = { kind: "working", reps_min: 8, reps_max: 12, weight_kg: 60 } as const;

  it("is empty with no Previous and no target", () => {
    for (const field of [
      "weight",
      "reps",
      "duration",
      "distance",
      "floors",
      "steps",
      "rpe",
    ] as const) {
      expect(ghostFor(field, null, null)).toBeNull();
    }
  });

  it("prefers Previous for weight, then the target, and keeps a 0 weight", () => {
    expect(ghostFor("weight", { weight_kg: 62.5 }, target)).toBe(62.5);
    expect(ghostFor("weight", null, target)).toBe(60);
    expect(ghostFor("weight", { weight_kg: null }, target)).toBe(60);
    expect(ghostFor("weight", { weight_kg: 0 }, target)).toBe(0);
  });

  it("uses Previous reps inside the planned range, else the lower bound", () => {
    expect(ghostFor("reps", { reps: 10 }, target)).toBe(10);
    expect(ghostFor("reps", { reps: 8 }, target)).toBe(8);
    expect(ghostFor("reps", { reps: 12 }, target)).toBe(12);
    expect(ghostFor("reps", { reps: 5 }, target)).toBe(8);
    expect(ghostFor("reps", { reps: 15 }, target)).toBe(8);
    expect(ghostFor("reps", null, target)).toBe(8);
  });

  it("uses Previous reps when no range is planned, and nothing without either", () => {
    expect(ghostFor("reps", { reps: 7 }, { kind: "working" })).toBe(7);
    expect(ghostFor("reps", { reps: 7 }, null)).toBe(7);
    expect(ghostFor("reps", null, { kind: "working" })).toBeNull();
  });

  it("handles duration, distance, floors and steps like weight", () => {
    const planned = {
      kind: "working",
      duration_s: 30,
      distance_m: 100,
      floors: 5,
      steps: 900,
    } as const;
    expect(ghostFor("duration", { duration_s: 45 }, planned)).toBe(45);
    expect(ghostFor("duration", null, planned)).toBe(30);
    expect(ghostFor("distance", { distance_m: 120 }, planned)).toBe(120);
    expect(ghostFor("distance", null, planned)).toBe(100);
    expect(ghostFor("floors", null, planned)).toBe(5);
    expect(ghostFor("steps", { steps: 1000 }, planned)).toBe(1000);
  });

  it("takes the planned effort, not Previous", () => {
    const planned = {
      kind: "working",
      reps_min: 5,
      reps_max: 5,
      effort_min: 7.5,
      effort_max: 8.5,
    } as const;
    expect(ghostFor("rpe", { rpe: 9 }, planned)).toBe(7.5);
    expect(ghostFor("rpe", { rpe: 9 }, target)).toBeNull();
  });
});
