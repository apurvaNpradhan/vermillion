import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "../vocabulary/format";
import { rangeGrid } from "./load-grid";
import {
  adjustmentLoadsFor,
  adjustPrescription,
  deviation,
  revertPrescriptionAdjustment,
  undoPrescriptionAdjustment,
} from "./same-day-adjustment";
import { latestAdjustment, prescriptionSchema, type Prescription } from "./prescription";
import type { SetKind } from "../vocabulary/vocabulary";

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
const open = (ids: readonly string[], kind: SetKind = "working") =>
  new Map(ids.map((id) => [id, kind] as const));

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
      actual: { reps?: number | null; rpe?: number | null; weight_kg?: number | null },
      options: {
        canIncrease?: boolean;
        open?: ReadonlyMap<string, SetKind>;
        value?: Prescription;
        loads?: typeof loads;
        kind?: SetKind;
        trigger?: string;
      } = {},
    ) =>
      adjustPrescription(
        options.value ?? base,
        options.trigger ?? first,
        { kind: options.kind ?? "working", ...actual },
        options.open ?? open([second, third]),
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
      expect(latestAdjustment(next)).toEqual({
        setId: first,
        reason: "reps_short",
        reps: 3,
        moved: [
          { id: second, fromKg: exact(start) },
          { id: third, fromKg: exact(start) },
        ],
      });
      expect(next?.sets[1]?.unadjustedWeightKg).toBe(exact(start));
    });

    it("raises the unticked sets after beating the target by two reps", () => {
      const next = adjust({ reps: 10, rpe: 8 });
      expect(weights(next ?? base).slice(1)).toEqual([
        expect.closeTo(exact(heavier), 2),
        expect.closeTo(exact(heavier), 2),
      ]);
      expect(latestAdjustment(next)?.reason).toBe("reps_over");
    });

    it.each([
      { rpe: 9.5, reason: "effort_high" },
      { rpe: 6.5, reason: "effort_low" },
    ] as const)("reads effort $rpe as $reason", ({ rpe, reason }) => {
      expect(latestAdjustment(adjust({ reps: 8, rpe }))?.reason).toBe(reason);
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
      const next = adjust({ reps: 5 }, { open: open([third]) });
      expect(weights(next ?? base)).toEqual([
        exact(start),
        exact(start),
        expect.closeTo(exact(lighter), 2),
      ]);
      expect(adjust({ reps: 5 }, { value: next ?? base, open: open([third]) })).toBeNull();
    });

    it("does nothing when every set after it is ticked", () => {
      expect(adjust({ reps: 5 }, { open: open([]) })).toBeNull();
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

    it("never raises in a Lighter week, but still lowers", () => {
      const now = new Date("2026-02-10T12:00:00Z");
      const week = [{ from: "2026-02-08T00:00:00Z", until: "2026-02-15T00:00:00Z" }];
      const during = adjustmentLoadsFor(
        { equipment: "machine", type: "weight_reps", unit },
        { unit, weightIncrementKg: null, lighterWeeks: week },
        null,
        now,
      );
      const after = adjustmentLoadsFor(
        { equipment: "machine", type: "weight_reps", unit },
        { unit, weightIncrementKg: null, lighterWeeks: week },
        null,
        new Date("2026-02-20T12:00:00Z"),
      );
      expect(during.lighter).toBe(true);
      expect(adjust({ reps: 10 }, { loads: during })).toBeNull();
      expect(adjust({ reps: 10 }, { loads: after })).not.toBeNull();
      expect(adjust({ reps: 5 }, { loads: during })).not.toBeNull();
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
      expect(restored?.adjustments).toBeUndefined();
      expect(restored?.adjustmentUndone).toBe(true);
      expect(undoPrescriptionAdjustment(restored ?? base, new Set([second]))).toBeNull();
      expect(adjust({ reps: 5 }, { value: restored ?? base })).toBeNull();
    });

    it("judges reps only at the suggested load, and compares estimated 1RM at another", () => {
      // Suggested at the target load for 8. A heavier set with fewer reps is worth about as much: nothing moves.
      expect(adjust({ weight_kg: exact(start * 1.1), reps: 6 })).toBeNull();
      expect(adjust({ weight_kg: exact(start * 1.1), reps: 6, rpe: 10 })).toBeNull();
      // A lighter set with more reps is not "beating" the target, so nothing is raised.
      expect(adjust({ weight_kg: exact(start * 0.9), reps: 10 })).toBeNull();
      // Much heavier for the same reps clearly beats it; much lighter for few reps clearly misses.
      expect(adjust({ weight_kg: exact(start * 1.2), reps: 8 })).not.toBeNull();
      expect(adjust({ weight_kg: exact(start * 0.8), reps: 8 })).not.toBeNull();
      // The same load is read by reps, whatever the effort says when it was not logged.
      expect(adjust({ weight_kg: exact(start), reps: 5 })).not.toBeNull();
    });

    it("reads reps and effort together as capacity", () => {
      // Fewer reps but easier: the capacity (reps + reps in reserve) is the same, so no miss.
      expect(adjust({ reps: 6, rpe: 6.5 })).toBeNull();
      // Fewer reps and harder is a miss; more reps but at a harder effort is not a gain.
      expect(adjust({ reps: 6, rpe: 8.5 })?.adjustments?.[0]?.reason).toBe("reps_short");
      expect(adjust({ reps: 10, rpe: 9.5 })).toBeNull();
      // On target in reps but much harder reads as effort; much easier as effort.
      expect(adjust({ reps: 8, rpe: 9.5 })?.adjustments?.[0]?.reason).toBe("effort_high");
      expect(adjust({ reps: 8, rpe: 6.5 })?.adjustments?.[0]?.reason).toBe("effort_low");
      // A single signal is read alone, even when the target has the other.
      expect(adjust({ reps: 5 })?.adjustments?.[0]?.reason).toBe("reps_short");
      expect(adjust({ rpe: 9.5 })?.adjustments?.[0]?.reason).toBe("effort_high");
    });

    it("moves only progressing sets, and a top set's miss lowers its back-offs", () => {
      const open3 = new Map<string, SetKind>([
        [second, "backoff"],
        [third, "warmup"],
      ]);
      const next = adjust({ reps: 5 }, { kind: "top", open: open3 });
      expect(weights(next ?? base)).toEqual([
        exact(start),
        expect.closeTo(exact(lighter), 2),
        exact(start),
      ]);
      const none = new Map<string, SetKind>([
        [second, "drop"],
        [third, "myo"],
      ]);
      expect(adjust({ reps: 5 }, { open: none })).toBeNull();
      expect(adjust({ reps: 5 }, { kind: "failure" })).toBeNull();
      expect(adjust({ reps: 5 }, { kind: "drop" })).toBeNull();
      expect(adjust({ reps: 5 }, { kind: "warmup" })).toBeNull();
    });

    it("compounds, and takes adjustments back one at a time", () => {
      const once = adjust({ reps: 5 }) ?? base;
      const twice = adjust(
        { reps: 5 },
        { value: once, trigger: second, open: open([third]) },
      ) as Prescription;
      expect(twice.adjustments?.map(({ setId }) => setId)).toEqual([first, second]);
      expect(twice.sets[2]?.ghosts.weight).toBeLessThan(once.sets[2]?.ghosts.weight ?? 0);
      expect(twice.sets[2]?.unadjustedWeightKg).toBe(exact(start));
      // Undo goes back one step and stops further adjusting.
      const undone = undoPrescriptionAdjustment(twice, new Set([third])) as Prescription;
      expect(undone.adjustments?.map(({ setId }) => setId)).toEqual([first]);
      expect(undone.sets[2]?.ghosts.weight).toBe(once.sets[2]?.ghosts.weight);
      expect(undone.sets[2]?.unadjustedWeightKg).toBe(exact(start));
      expect(undone.adjustmentUndone).toBe(true);
      const again = undoPrescriptionAdjustment(undone, new Set([third])) as Prescription;
      expect(again.sets[2]?.ghosts.weight).toBe(exact(start));
      expect(again.sets[2]?.unadjustedWeightKg).toBeUndefined();
      expect(again.adjustments).toBeUndefined();
    });

    it("reverts the trigger's adjustment when it is unticked, and lets it trigger again", () => {
      const once = adjust({ reps: 5 }) ?? base;
      const reverted = revertPrescriptionAdjustment(once, first, new Set([second, third]));
      expect(weights(reverted ?? base)).toEqual([exact(start), exact(start), exact(start)]);
      expect(reverted?.adjustments).toBeUndefined();
      expect(reverted?.adjustmentUndone).toBeUndefined();
      expect(reverted?.sets.every((set) => set.unadjustedWeightKg === undefined)).toBe(true);
      expect(adjust({ reps: 5 }, { value: reverted ?? base })).not.toBeNull();
      // Sets that were already done keep what they were done at; a set that triggered nothing
      // reverts nothing.
      const partly = revertPrescriptionAdjustment(once, first, new Set([third]));
      expect(weights(partly ?? base)).toEqual([
        exact(start),
        expect.closeTo(exact(lighter), 2),
        exact(start),
      ]);
      expect(revertPrescriptionAdjustment(once, second, new Set([third]))).toBeNull();
      // An older adjustment cannot be taken back without the ones built on it.
      const twice = adjust(
        { reps: 5 },
        { value: once, trigger: second, open: open([third]) },
      ) as Prescription;
      const both = revertPrescriptionAdjustment(twice, first, new Set([second, third]));
      expect(both?.adjustments).toBeUndefined();
      expect(weights(both ?? base)).toEqual([exact(start), exact(start), exact(start)]);
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

describe("deviation", () => {
  const ghosts = { weight: 100, reps: 8, rpe: 8 } as const;
  it("compares estimated 1RM when the load is not the suggested one", () => {
    expect(deviation(ghosts, { kind: "working", weight_kg: 110, reps: 6 })).toBeNull();
    expect(deviation(ghosts, { kind: "working", weight_kg: 90, reps: 10 })).toBeNull();
    expect(deviation(ghosts, { kind: "working", weight_kg: 120, reps: 8 })).toMatchObject({
      reason: "reps_over",
    });
    expect(deviation(ghosts, { kind: "working", weight_kg: 80, reps: 8 })).toMatchObject({
      reason: "reps_short",
    });
  });
  it("says nothing when the estimate cannot be made", () => {
    expect(deviation(ghosts, { kind: "working", weight_kg: 110, reps: 20 })).toBeNull();
    expect(deviation({ weight: 100 }, { kind: "working", weight_kg: 110, reps: 6 })).toBeNull();
  });
});
