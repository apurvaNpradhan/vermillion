import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "../vocabulary/format";
import { testWorkingLoad } from "./test-load";

const NOW = new Date("2026-03-01T12:00:00Z");
const DAY = 86_400_000;

/** A finished Session of weighted dips: `added` on the belt, the set's own bodyweight snapshot. */
function dips(added: number, reps: number, bodyweight: number) {
  const at = new Date(NOW.getTime() - 7 * DAY).toISOString();
  return {
    started_at: at,
    phase: null,
    sets: [
      {
        kind: "working",
        completed_at: at,
        weight_kg: added,
        reps,
        rpe: undefined,
        bodyweight_kg: bodyweight,
      },
    ],
  } as const;
}

describe.each([
  { unit: "kg", added: 20, bodyweight: 80, today: 90 },
  { unit: "lb", added: 45, bodyweight: 180, today: 200 },
] as const)("the Test single of a weighted bodyweight lift in $unit", (row) => {
  const toKg = (value: number) => (row.unit === "kg" ? value : value * KG_PER_LB);
  const [added, bodyweight, today] = [row.added, row.bodyweight, row.today].map(toKg);
  // The estimate is of the whole load, 5 reps of (belt + body); the seed is the belt alone.
  const estimate = (((added ?? 0) + (bodyweight ?? 0)) * 36) / 32;
  const history = [dips(added ?? 0, 5, bodyweight ?? 0)];

  it("subtracts today's bodyweight when it is known", () => {
    const seed = testWorkingLoad(history, "bodyweight_weighted_reps", {
      now: NOW,
      single: true,
      bodyweightKg: today ?? null,
    });
    expect(seed).toBeCloseTo(estimate * 0.925 - (today ?? 0), 5);
  });

  it("subtracts the bodyweight of the set it estimated from when today's is not known", () => {
    const seed = testWorkingLoad(history, "bodyweight_weighted_reps", { now: NOW, single: true });
    expect(seed).toBeCloseTo(estimate * 0.925 - (bodyweight ?? 0), 5);
  });
});
