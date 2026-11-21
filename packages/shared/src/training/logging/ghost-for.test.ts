import { describe, expect, it } from "vitest";

import { ghostFor } from "./ghost-for";
import { suggestNext } from "../progress/progression";

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

  it("prefers the copied target over newer Previous in a repeated exercise", () => {
    const copied = {
      kind: "working",
      weight_kg: 100,
      reps_min: 6,
      reps_max: 6,
      duration_s: 45,
      distance_m: 500,
    } as const;
    const newer = { weight_kg: 110, reps: 4, duration_s: 30, distance_m: 400 };
    expect(ghostFor("weight", newer, copied, null, true)).toBe(100);
    expect(ghostFor("reps", newer, copied, null, true)).toBe(6);
    expect(ghostFor("duration", newer, copied, null, true)).toBe(45);
    expect(ghostFor("distance", newer, copied, null, true)).toBe(500);
    // Previous still fills what the copy has no value for.
    expect(ghostFor("floors", { floors: 12 }, copied, null, true)).toBe(12);
    // Without the flag Previous wins, as before.
    expect(ghostFor("weight", newer, copied)).toBe(110);
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

  const progressingKinds: ("top" | "backoff")[] = ["top", "backoff"];
  it.each(progressingKinds)("uses the suggestion for %s sets", (kind) => {
    const planned = { ...target, kind };
    const suggestion = { weightKg: 65, reps: 9 };
    expect(ghostFor("weight", { weight_kg: 60 }, planned, suggestion)).toBe(65);
    expect(ghostFor("reps", { reps: 8 }, planned, suggestion)).toBe(9);
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

describe("ghostFor with a new back-off set", () => {
  it("shows the prescribed weight, not a progression of a heavier working set", () => {
    const backoff = { kind: "backoff", reps_min: 6, reps_max: 8, weight_kg: 60 } as const;
    const next = suggestNext(
      [backoff],
      [
        {
          started_at: "2026-11-13T10:00:00Z",
          sets: [
            {
              id: "s",
              exercise_id: "e",
              exercise_type: "weight_reps",
              kind: "working",
              completed_at: "2026-11-13",
              reps: 12,
              weight_kg: 100,
            },
          ],
        },
      ],
      "weight_reps",
      "barbell",
      { weightUnit: "kg", weightIncrementKg: null },
      { now: new Date("2026-11-16T12:00:00Z") },
    );
    expect(ghostFor("weight", null, backoff, next?.sets[0])).toBe(60);
  });
});
