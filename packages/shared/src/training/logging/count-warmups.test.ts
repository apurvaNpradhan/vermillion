import { describe, expect, it } from "vitest";

import { muscleDistribution } from "../volume/muscle-distribution";
import { sessionTotals } from "../volume/volume";
import { exerciseRecords } from "../progress/records";
import { isCounted, withWarmupsCounted } from "./logged-set";
import { loggedSet, sessionOf, untickedSet } from "./session-fixtures";

const exercises = [{ id: "bench", primary_muscle: "chest", secondary_muscles: [] }] as const;
const warmup = () => loggedSet({ kind: "warmup", weight_kg: 40, reps: 10 });
const sessions = () => [
  sessionOf("a", "2026-01-01T10:00:00Z", [
    warmup(),
    loggedSet({ kind: "warmup", weight_kg: 200, reps: 1 }),
    loggedSet({ weight_kg: 100, reps: 5 }),
    untickedSet({ kind: "warmup", weight_kg: 60, reps: 5 }),
  ]),
];

describe("counting warm-up sets", () => {
  it("leaves warm-ups out by default and counts ticked ones when asked", () => {
    expect(isCounted(warmup())).toBe(false);
    expect(isCounted({ ...warmup(), warmup_counted: true })).toBe(true);
    expect(isCounted(untickedSet({ kind: "warmup", warmup_counted: true }))).toBe(false);
  });

  it("changes nothing when off", () => {
    const [off] = withWarmupsCounted(sessions(), false);
    expect(sessionTotals(off?.sets ?? [])).toEqual({ volume: 500, sets: 1, reps: 5 });
  });

  it("adds warm-ups to volume and set counts when on, never an unticked one", () => {
    const [on] = withWarmupsCounted(sessions(), true);
    expect(sessionTotals(on?.sets ?? [])).toEqual({ volume: 400 + 200 + 500, sets: 3, reps: 16 });
  });

  it("adds warm-ups to muscle volume when on", () => {
    const [off] = withWarmupsCounted(sessions(), false);
    const [on] = withWarmupsCounted(sessions(), true);
    expect(muscleDistribution(off?.sets ?? [], exercises)).toEqual([{ muscle: "chest", sets: 1 }]);
    expect(muscleDistribution(on?.sets ?? [], exercises)).toEqual([{ muscle: "chest", sets: 3 }]);
  });

  it("lets a warm-up set a record only when on", () => {
    const heaviest = (counted: boolean) =>
      exerciseRecords(withWarmupsCounted(sessions(), counted)).get("bench")?.get("heaviest_weight");
    expect(heaviest(false)).toBe(100);
    expect(heaviest(true)).toBe(200);
  });
});
