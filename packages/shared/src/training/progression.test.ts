import { describe, expect, it } from "vitest";
import { suggestNext, progressionIncrement } from "./progression";
import { KG_PER_LB } from "./format";
import type { LoggedSet } from "./logged-set";
import type { PlannedSet } from "./planned-sets";

const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
const plan: PlannedSet[] = [0, 1].map(() => ({ kind: "working", reps_min: 8, reps_max: 12 }));
const logged = (reps: number, weight = 80): LoggedSet => ({
  id: "s",
  exercise_id: "e",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-11-01",
  reps,
  weight_kg: weight,
});
const suggest = (last: LoggedSet[], older: LoggedSet[] = [], targets = plan) =>
  suggestNext(targets, [last, older], "weight_reps", "barbell", settings);

describe("double progression", () => {
  it("requires history and an eligible type", () => {
    expect(suggest([])).toBeNull();
    for (const type of [
      "duration",
      "distance_duration",
      "short_distance_weight",
      "bodyweight_assisted_reps",
    ] as const)
      expect(suggestNext(plan, [[logged(12)]], type, "none", settings)).toBeNull();
  });
  it("raises a uniform weight only after every set tops its range", () => {
    expect(suggest([logged(12), logged(13)])).toMatchObject({
      reason: "add_weight",
      sets: [
        { weightKg: 82.5, reps: 8 },
        { weightKg: 82.5, reps: 8 },
      ],
    });
    expect(suggest([logged(12), logged(12, 70)])?.reason).toBe("add_rep");
    expect(suggest([logged(12)])?.reason).toBe("add_rep");
  });
  it("adds reps only below the cap and never reduces a logged weight", () => {
    expect(suggest([logged(10), logged(12, 70)])?.sets).toEqual([
      { weightKg: 80, reps: 11 },
      { weightKg: 70, reps: 12 },
    ]);
  });
  it("holds after two misses, even on different working sets", () => {
    expect(suggest([logged(7), logged(12)], [logged(10), logged(6)])).toMatchObject({
      reason: "hold",
      sets: [
        { weightKg: 80, reps: 7 },
        { weightKg: 80, reps: 12 },
      ],
    });
    expect(suggest([logged(7), logged(12)], [logged(10), logged(10)])?.reason).toBe("add_rep");
  });
  it("ignores warm-ups and drops and matches working ordinals", () => {
    const targets: PlannedSet[] = [{ kind: "warmup" }, ...plan, { kind: "drop" }];
    expect(
      suggest(
        [{ ...logged(1), kind: "warmup" }, logged(12), logged(12), { ...logged(1), kind: "drop" }],
        [],
        targets,
      )?.sets,
    ).toEqual([null, { weightKg: 82.5, reps: 8 }, { weightKg: 82.5, reps: 8 }, null]);
    expect(suggest([{ ...logged(12), completed_at: null }])).toBeNull();
  });
  it("keeps last values without a planned range, including mixed prescriptions", () => {
    expect(suggest([logged(6)], [], [{ kind: "working" }])).toMatchObject({
      reason: "same_as_last",
      sets: [{ weightKg: 80, reps: 6 }],
    });
    expect(
      suggest([logged(6), logged(10)], [], [{ kind: "working" }, plan[0]!])?.sets[0]?.reps,
    ).toBe(6);
  });
  it("uses the lower bound as the cap when no upper bound exists", () => {
    expect(suggest([logged(8)], [], [{ kind: "working", reps_min: 8 }])?.reason).toBe("add_weight");
  });
  it("caps reps-only progression and does not add external weight", () => {
    for (const type of ["reps_only", "bodyweight_reps"] as const) {
      expect(suggestNext(plan, [[logged(12), logged(12)]], type, "none", settings)).toMatchObject({
        reason: "add_rep",
        sets: [
          { weightKg: 80, reps: 12 },
          { weightKg: 80, reps: 12 },
        ],
      });
    }
  });
  it("chooses increments in the user's unit and respects kg overrides", () => {
    expect(progressionIncrement("barbell", settings)).toBe(2.5);
    for (const equipment of [
      "dumbbell",
      "machine",
      "other",
      "resistance_band",
      "kettlebell",
    ] as const)
      expect(progressionIncrement(equipment, settings)).toBe(2);
    expect(progressionIncrement("barbell", { ...settings, weightUnit: "lb" })).toBe(5 * KG_PER_LB);
    expect(progressionIncrement("machine", { weightUnit: "lb", weightIncrementKg: 1.25 })).toBe(
      1.25,
    );
  });
});
