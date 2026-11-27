import { describe, expect, it } from "vitest";

import { exerciseRecords, recordsMovedByEffort } from "../progress/records";
import { fellShortOfSuggestion, repsAtLoad } from "../progress/suggestion-ledger";
import { stalledSessions } from "../progress/stalled-lift";
import { KG_PER_LB } from "../vocabulary/format";
import { estimatedOneRepMax, repsInReserve } from "./volume";

describe("estimatedOneRepMax", () => {
  it("is Brzycki for 1 to 12 reps", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(112.5, 10);
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333, 3);
    expect(estimatedOneRepMax(100, 12)).toBeCloseTo(144, 10);
  });

  it("is null outside 1 to 12 reps, for fractions and for no weight", () => {
    expect(estimatedOneRepMax(100, 0)).toBeNull();
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(100, 5.5)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
  });
});

describe("an effort-aware estimate", () => {
  it("counts the reps left in reserve as reps, up to 12", () => {
    // 8 reps at RPE 8 is a 10-rep set; RPE 10 and no effort are the reps alone.
    expect(estimatedOneRepMax(100, 8, 8)).toBeCloseTo(estimatedOneRepMax(100, 10) ?? 0, 10);
    expect(estimatedOneRepMax(100, 8, 10)).toBe(estimatedOneRepMax(100, 8));
    expect(estimatedOneRepMax(100, 8, null)).toBe(estimatedOneRepMax(100, 8));
    expect(estimatedOneRepMax(100, 8, 9.5)).toBeCloseTo((100 * 36) / (37 - 8.5), 10);
    // At most four in reserve (RPE 6), and never beyond the 12 reps Brzycki covers.
    expect(repsInReserve(6)).toBe(4);
    expect(repsInReserve(3)).toBe(4);
    expect(repsInReserve(11)).toBe(0);
    expect(estimatedOneRepMax(100, 5, 4)).toBeCloseTo(estimatedOneRepMax(100, 9) ?? 0, 10);
    expect(estimatedOneRepMax(100, 11, 6)).toBeCloseTo(estimatedOneRepMax(100, 12) ?? 0, 10);
    // It does not widen what counts as a set: 13 reps still has no estimate.
    expect(estimatedOneRepMax(100, 13, 8)).toBeNull();
  });

  it.each([
    { unit: "kg", load: 100, short: 90 },
    { unit: "lb", load: 225, short: 205 },
  ] as const)(
    "keeps a set worth its own reps at its own load in $unit",
    ({ unit, load, short }) => {
      const kg = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
      for (const rpe of [null, 10, 9, 8, 6]) {
        expect(repsAtLoad({ weight_kg: kg(load), reps: 8, rpe }, kg(load))).toBeCloseTo(8, 6);
      }
      // At RPE 8 the set had two in reserve: a 10-rep set at its load, worth what that is at the
      // lighter load, minus the two it left, so it can be set against a target done at that effort.
      const tenRep = (kg(load) * 36) / 27;
      expect(repsAtLoad({ weight_kg: kg(load), reps: 8, rpe: 8 }, kg(short))).toBeCloseTo(
        37 - (36 * kg(short)) / tenRep - 2,
        6,
      );
      // A heavier, easier set is no miss against a lighter suggestion: 6 at 110% for RPE 7.
      expect(
        fellShortOfSuggestion(
          { weight_kg: kg(load), reps: 8 },
          { weight_kg: kg(load * 1.1), reps: 6, rpe: 7 },
        ),
      ).toBe(false);
    },
  );

  const set = (weight: number, reps: number, rpe: number | null) => ({
    id: `${weight}-${reps}-${rpe}`,
    exercise_id: "lift",
    exercise_type: "weight_reps" as const,
    kind: "working" as const,
    completed_at: "2026-01-01T10:00:00Z",
    weight_kg: weight,
    reps,
    rpe,
  });
  const session = (id: string, day: number, sets: ReturnType<typeof set>[]) => ({
    id,
    started_at: `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`,
    finished_at: `2026-01-${String(day).padStart(2, "0")}T11:00:00Z`,
    sets,
  });

  it("moves Records with the effort logged, and says when it did", () => {
    const history = [session("a", 1, [set(100, 8, 8)])];
    expect(exerciseRecords(history).get("lift")?.get("estimated_one_rep_max")).toBeCloseTo(
      estimatedOneRepMax(100, 10) ?? 0,
      6,
    );
    expect(recordsMovedByEffort(history)).toBe(true);
    // Sets to failure or without effort do not move: nothing to say.
    expect(recordsMovedByEffort([session("b", 2, [set(100, 8, 10), set(90, 10, null)])])).toBe(
      false,
    );
    expect(recordsMovedByEffort([])).toBe(false);
  });

  it("reads a lower effort at the same load and reps as a gain for the stall check", () => {
    const flat = [1, 8, 15, 22].map((day) => session(`s${day}`, day, [set(100, 8, 9)]));
    const sessions = [...flat].reverse();
    expect(stalledSessions(sessions, "weight_reps")).toBe(3);
    // The last Session was easier at the same load and reps: its estimate rose by over 1%.
    const easier = [session("s29", 29, [set(100, 8, 7)]), ...sessions];
    expect(stalledSessions(easier, "weight_reps")).toBe(0);
  });
});
