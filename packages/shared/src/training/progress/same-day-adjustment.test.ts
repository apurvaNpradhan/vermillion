import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "../vocabulary/format";
import { rangeGrid } from "./load-grid";
import {
  adjustmentLoadsFor,
  adjustPrescription,
  undoPrescriptionAdjustment,
} from "./same-day-adjustment";
import { prescriptionSchema, type Prescription } from "./prescription";

const EXERCISE = "0192f0a0-0000-7000-8000-000000000001";
const first = "0192f0a0-0000-7000-8000-000000000011";
const second = "0192f0a0-0000-7000-8000-000000000012";
const third = "0192f0a0-0000-7000-8000-000000000013";

function snapshot(weightKg: number, extra: Partial<Prescription> = {}): Prescription {
  return prescriptionSchema.parse({
    exerciseId: EXERCISE,
    revision: "0192f0a0-0000-7000-8000-0000000000a1",
    previousRevision: null,
    reason: "add_weight",
    incrementKg: 2.5,
    breakDays: null,
    capKg: null,
    sets: [first, second, third].map((id) => ({
      id,
      ghosts: { weight: weightKg, reps: 8, rpe: 8 },
      outcome: { reason: "add_weight", changeKg: 2.5 },
    })),
    ...extra,
  });
}

const weights = (value: Prescription) => value.sets.map((set) => set.ghosts.weight);

describe.each([
  { unit: "kg", start: 60, lighter: 57.5, heavier: 62.5, gridDown: 50, exact: (n: number) => n },
  {
    unit: "lb",
    start: 135,
    lighter: 130,
    heavier: 140,
    gridDown: 120,
    exact: (n: number) => n * KG_PER_LB,
  },
] as const)(
  "same-day adjustment in $unit",
  ({ unit, start, lighter, heavier, gridDown, exact }) => {
    const loads = adjustmentLoadsFor(
      { equipment: "machine", type: "weight_reps", unit },
      { unit, weightIncrementKg: null },
      null,
    );
    const base = snapshot(exact(start));
    const adjust = (
      actual: { reps?: number | null; rpe?: number | null },
      options: {
        canIncrease?: boolean;
        open?: string[];
        value?: Prescription;
        loads?: typeof loads;
      } = {},
    ) =>
      adjustPrescription(
        options.value ?? base,
        first,
        actual,
        new Set(options.open ?? [second, third]),
        options.loads ?? loads,
        options.canIncrease ?? true,
      );

    it("lowers only the unticked sets after a set misses by two reps", () => {
      const next = adjust({ reps: 5, rpe: 8 });
      expect(weights(next ?? base)).toEqual([
        exact(start),
        expect.closeTo(exact(lighter), 2),
        expect.closeTo(exact(lighter), 2),
      ]);
      expect(next?.adjustment).toEqual({ setId: first, reason: "reps_short", reps: 3 });
      expect(next?.adjustedBy).toEqual([first]);
      expect(next?.sets[1]?.unadjustedWeightKg).toBe(exact(start));
    });

    it("raises the unticked sets after beating the target by two reps", () => {
      const next = adjust({ reps: 10, rpe: 8 });
      expect(weights(next ?? base).slice(1)).toEqual([
        expect.closeTo(exact(heavier), 2),
        expect.closeTo(exact(heavier), 2),
      ]);
      expect(next?.adjustment?.reason).toBe("reps_over");
    });

    it.each([
      { rpe: 9.5, reason: "effort_high" },
      { rpe: 6.5, reason: "effort_low" },
    ] as const)("reads effort $rpe as $reason", ({ rpe, reason }) => {
      expect(adjust({ reps: 8, rpe })?.adjustment?.reason).toBe(reason);
    });

    it.each([
      { name: "one rep short", actual: { reps: 7, rpe: 8 } },
      { name: "one rep over", actual: { reps: 9, rpe: 8 } },
      { name: "effort 1 higher", actual: { reps: 8, rpe: 9 } },
      { name: "effort 1 lower", actual: { reps: 8, rpe: 7 } },
      { name: "nothing logged", actual: {} },
    ])("does nothing for $name", ({ actual }) => {
      expect(adjust(actual)).toBeNull();
    });

    it("never moves a ticked set, and acts once per set", () => {
      const next = adjust({ reps: 5 }, { open: [third] });
      expect(weights(next ?? base)).toEqual([
        exact(start),
        exact(start),
        expect.closeTo(exact(lighter), 2),
      ]);
      expect(adjust({ reps: 5 }, { value: next ?? base, open: [third] })).toBeNull();
    });

    it("does nothing when every set after it is ticked", () => {
      expect(adjust({ reps: 5 }, { open: [] })).toBeNull();
    });

    it("never raises in a Deload, after a break, or in a stall deload, but lowers", () => {
      expect(adjust({ reps: 10 }, { canIncrease: false })).toBeNull();
      expect(
        adjust({ reps: 10 }, { value: snapshot(exact(start), { reason: "deload" }) }),
      ).toBeNull();
      expect(
        adjust({ reps: 10 }, { value: snapshot(exact(start), { reason: "after_break" }) }),
      ).toBeNull();
      expect(adjust({ reps: 5 }, { canIncrease: false })).not.toBeNull();
    });

    it("never passes the snapshot's cap", () => {
      expect(
        adjust({ reps: 10 }, { value: snapshot(exact(start), { capKg: exact(start) }) }),
      ).toBeNull();
    });

    it("snaps to the gym grid", () => {
      const grid = rangeGrid([{ min: exact(10), max: exact(start + 10), step: exact(10) }]);
      const gridLoads = { ...loads, grid };
      const down = adjust({ reps: 5 }, { loads: gridLoads });
      expect(down?.sets[1]?.ghosts.weight).toBeCloseTo(exact(gridDown), 2);
      const capped = adjust(
        { reps: 10 },
        { loads: gridLoads, value: snapshot(exact(start), { capKg: exact(start + 5) }) },
      );
      expect(capped).toBeNull();
    });

    it("does nothing for sets without a weight", () => {
      const free = {
        ...base,
        sets: base.sets.map((set) => ({ ...set, ghosts: { reps: 8 } })),
      };
      expect(adjust({ reps: 5 }, { value: free })).toBeNull();
    });

    it("undoes only the sets that are still unticked and blocks a second adjustment", () => {
      const next = adjust({ reps: 5 }) ?? base;
      const restored = undoPrescriptionAdjustment(next, new Set([second]));
      expect(weights(restored ?? base)).toEqual([
        exact(start),
        exact(start),
        expect.closeTo(exact(lighter), 2),
      ]);
      expect(restored?.adjustment).toBeUndefined();
      expect(restored?.adjustmentUndone).toBe(true);
      expect(undoPrescriptionAdjustment(restored ?? base, new Set([second]))).toBeNull();
      expect(adjust({ reps: 5 }, { value: restored ?? base })).toBeNull();
    });

    it("round-trips through the schema", () => {
      const next = adjust({ reps: 5 }) ?? base;
      expect(prescriptionSchema.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
    });
  },
);

describe("adjustment units", () => {
  it("reads the exercise's own unit and the lifter's step in it", () => {
    const loads = adjustmentLoadsFor(
      { equipment: "barbell", type: "weight_reps", unit: "lb" },
      { unit: "kg", weightIncrementKg: 2.5, weightIncrementUnit: "kg" },
      null,
    );
    expect(loads.unit).toBe("lb");
    // 2.5 kg is closest to 5 lb among the lb choices.
    expect(loads.weightIncrementKg).toBeCloseTo(2.268, 2);
  });
});
