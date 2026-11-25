import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { stalledSessions } from "../progress/stalled-lift";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import type { Equipment } from "../../exercise/vocabulary";
import { cappedRepCeiling, isBigJump } from "./ceiling";
import { rangeGrid } from "../progress/load-grid";
import { suggestNext } from "./pipeline";

const DAY = 86_400_000;
const START = Date.parse("2026-01-01T12:00:00Z");
const target: PlannedSet = { kind: "working", reps_min: 8, reps_max: 12 };
const plan: PlannedSet[] = [target, target];

describe("what counts as a big jump", () => {
  it("is more than about 10% heavier, and exactly 10% is not", () => {
    expect(isBigJump(15, 17.5)).toBe(true);
    expect(isBigJump(25, 27.5)).toBe(false);
    expect(isBigJump(30, 32.5)).toBe(false);
    expect(isBigJump(0, 2.5)).toBe(false);
  });
});

describe.each([
  { unit: "kg", light: 15, lightNext: 17.5, heavy: 30, heavyNext: 32.5 },
  { unit: "lb", light: 35, lightNext: 40, heavy: 70, heavyNext: 75 },
] as const)(
  "more reps before a big jump in $unit",
  ({ unit, light, lightNext, heavy, heavyNext }) => {
    const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
    const settings = { weightUnit: unit, weightIncrementKg: null };

    const session = (
      day: number,
      weight: number,
      reps: readonly number[],
      extra: Partial<LoggedSet> = {},
    ) => ({
      started_at: new Date(START + day * DAY).toISOString(),
      sets: reps.map((count, index): LoggedSet => ({
        id: `${day}-${index}`,
        exercise_id: "lift",
        exercise_type: "weight_reps",
        kind: "working",
        completed_at: new Date(START + day * DAY).toISOString(),
        weight_kg: kg(weight),
        reps: count,
        target,
        ...extra,
      })),
    });
    const ask = (
      history: ReturnType<typeof session>[],
      day: number,
      equipment: Equipment = "dumbbell",
    ) =>
      suggestNext(plan, history, "weight_reps", equipment, settings, {
        now: new Date(START + day * DAY),
      });

    it("adds reps past the range's top while the next dumbbell is far heavier", () => {
      const result = ask([session(0, light, [12, 12])], 2);
      expect(result?.reason).toBe("more_reps");
      expect(result?.sets).toEqual([
        { weightKg: kg(light), reps: 13 },
        { weightKg: kg(light), reps: 13 },
      ]);
      const outcome = result?.outcomes[0];
      expect(outcome).toMatchObject({ reason: "more_reps", ceiling: cappedRepCeiling(12) });
      // The factor is the share the load would rise by, for the copy to name.
      expect(outcome?.loadFactor).toBeCloseTo(lightNextOver(), 2);
      function lightNextOver() {
        return kg(lightNext) / kg(light);
      }
    });

    it("jumps once the extended ceiling is reached, back to the bottom of the range", () => {
      const result = ask([session(0, light, [18, 18])], 2);
      expect(result?.reason).toBe("add_weight");
      expect(result?.sets[0]).toEqual({ weightKg: expect.closeTo(kg(lightNext), 3), reps: 8 });
    });

    it("jumps at the top of the range when the next load is a small step", () => {
      const result = ask([session(0, heavy, [12, 12])], 2);
      expect(result?.reason).toBe("add_weight");
      expect(result?.sets[0]?.weightKg).toBeCloseTo(kg(heavyNext), 3);
    });

    it("walks a light dumbbell from 12 to 18 reps, then to the next dumbbell, without a stall", () => {
      const history = [session(0, light, [12, 12])];
      const seen: string[] = [];
      for (let day = 1; day <= 9; day += 1) {
        const result = ask(history, day * 2);
        if (!result) throw new Error("Expected a suggestion");
        seen.push(`${result.sets[0]?.reps}@${result.reason}`);
        history.unshift(
          session(
            day * 2,
            Math.round(((result.sets[0]?.weightKg ?? 0) / (unit === "kg" ? 1 : KG_PER_LB)) * 100) /
              100,
            result.sets.map((set) => set?.reps ?? 0),
          ),
        );
        expect(stalledSessions(history, "weight_reps")).toBe(0);
      }
      expect(seen.slice(0, 7)).toEqual([
        "13@more_reps",
        "14@more_reps",
        "15@more_reps",
        "16@more_reps",
        "17@more_reps",
        "18@more_reps",
        "8@add_weight",
      ]);
    });

    it("keeps straight sets together: the load waits for the set that is behind", () => {
      const result = ask([session(0, light, [18, 14])], 2);
      expect(result?.sets.map((set) => set?.reps)).toEqual([18, 15]);
      expect(result?.outcomes.map((outcome) => outcome?.reason)).toEqual([
        "hold_together",
        "more_reps",
      ]);
    });

    it("does not hold back a set that was easy: the lifter asked for more", () => {
      const result = ask([session(0, light, [12, 12], { rpe: 6 })], 2);
      expect(result?.reason).toBe("add_weight");
    });

    it("also applies to a stack whose pins are far apart", () => {
      const pin = unit === "kg" ? 5 : 10;
      const grid = rangeGrid([{ min: kg(pin), max: kg(pin * 30), step: kg(pin) }]);
      const at = (weight: number) =>
        suggestNext(plan, [session(0, weight, [12, 12])], "weight_reps", "machine", settings, {
          now: new Date(START + 2 * DAY),
          grid,
        });
      // One pin is 12.5% of 8 pins and 8.3% of 12.
      expect(at(pin * 8)?.reason).toBe("more_reps");
      expect(at(pin * 12)?.reason).toBe("add_weight");
    });
  },
);
