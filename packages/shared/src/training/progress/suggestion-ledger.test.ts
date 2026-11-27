import { describe, expect, it } from "vitest";

import { KG_PER_LB } from "../vocabulary/format";
import type { SetKind } from "../vocabulary/vocabulary";
import { prescriptionSchema } from "./prescription";
import { fellShortOfSuggestion, repsAtLoad, suggestionLedger } from "./suggestion-ledger";

const ids = ["1", "2", "3"].map((n) => `0192f0a0-0000-7000-8000-00000000002${n}`);
const [a = "", b = "", c = ""] = ids;
const snapshot = (weightKg: number) =>
  prescriptionSchema.parse({
    exerciseId: "0192f0a0-0000-7000-8000-000000000001",
    revision: "0192f0a0-0000-7000-8000-0000000000a1",
    previousRevision: null,
    reason: null,
    incrementKg: 0,
    breakDays: null,
    capKg: null,
    sets: ids.map((id, index) => ({
      id,
      // The third set was lowered by a same-day adjustment, but it was suggested the original.
      ghosts: { weight: index === 2 ? weightKg - 2.5 : weightKg, reps: 8 },
      outcome: null,
      ...(index === 2 ? { unadjustedWeightKg: weightKg } : {}),
    })),
  });
const done = (
  id: string,
  weight_kg: number,
  reps: number,
  extra: { kind?: SetKind; completed?: boolean } = {},
) => ({
  id,
  kind: "working" as SetKind,
  completed: true,
  weight_kg,
  reps,
  ...extra,
});

describe.each([
  { unit: "kg", weight: 100 },
  { unit: "lb", weight: 225 * KG_PER_LB },
])("suggestion ledger in $unit", ({ weight }) => {
  it("counts the working sets that met the suggestion and keeps the first as the example", () => {
    const ledger = suggestionLedger(snapshot(weight), [
      done(a, weight, 6),
      done(b, weight, 8),
      // Lowered by the adjustment, so it fell short of what was first suggested.
      done(c, weight - 2.5, 8),
    ]);
    expect(ledger).toEqual({
      suggested: { weight_kg: weight, reps: 8 },
      done: { weight_kg: weight, reps: 6 },
      total: 3,
      met: 1,
    });
  });

  it("is met on more load or more reps, and ignores warm-ups, unticked sets and no snapshot", () => {
    const ledger = suggestionLedger(snapshot(weight), [
      done(a, weight + 5, 8),
      done(b, weight, 12),
      done(c, weight, 8, { completed: false }),
      done("0192f0a0-0000-7000-8000-0000000000ff", weight, 1),
      done(a, 1, 1, { kind: "warmup" }),
    ]);
    expect(ledger).toMatchObject({ total: 2, met: 2 });
    // Top and back-off sets progress too; drop, myo and failure sets do not.
    expect(
      suggestionLedger(snapshot(weight), [
        done(a, weight, 8, { kind: "top" }),
        done(b, weight, 6, { kind: "backoff" }),
        done(c, weight, 1, { kind: "drop" }),
      ]),
    ).toMatchObject({ total: 2, met: 1 });
    expect(suggestionLedger(null, [done(a, weight, 8)])).toBeNull();
    expect(
      suggestionLedger(snapshot(weight), [done(a, weight, 8, { completed: false })]),
    ).toBeNull();
  });
});

describe("fellShortOfSuggestion", () => {
  it("never counts a blank value as short", () => {
    expect(fellShortOfSuggestion({ weight_kg: 100, reps: 8 }, {})).toBe(false);
    expect(fellShortOfSuggestion({ weight_kg: null, reps: 8 }, { weight_kg: 10, reps: 8 })).toBe(
      false,
    );
    expect(fellShortOfSuggestion({ weight_kg: 100, reps: 8 }, { weight_kg: 99.9, reps: 8 })).toBe(
      true,
    );
  });
});

describe.each([
  { unit: "kg", at: 100, offset: 5 },
  { unit: "lb", at: 225 * KG_PER_LB, offset: 10 * KG_PER_LB },
])("fellShortOfSuggestion against another load in $unit", ({ at, offset }) => {
  const suggested = { weight_kg: at, reps: 8 };
  it("reads a heavier set by estimated 1RM, so always adding a step is not missing", () => {
    expect(fellShortOfSuggestion(suggested, { weight_kg: at + offset, reps: 8 })).toBe(false);
    expect(fellShortOfSuggestion(suggested, { weight_kg: at + offset, reps: 7 })).toBe(false);
    expect(fellShortOfSuggestion(suggested, { weight_kg: at + offset, reps: 5 })).toBe(true);
    expect(fellShortOfSuggestion(suggested, { weight_kg: at + offset, reps: 6 })).toBe(false);
  });
  it("reads a lighter set the same way", () => {
    expect(fellShortOfSuggestion(suggested, { weight_kg: at - offset, reps: 8 })).toBe(true);
    expect(fellShortOfSuggestion(suggested, { weight_kg: at - offset, reps: 12 })).toBe(false);
  });
  it("falls back to the load past the estimate", () => {
    expect(fellShortOfSuggestion(suggested, { weight_kg: at - offset, reps: 15 })).toBe(false);
    expect(
      fellShortOfSuggestion({ weight_kg: at, reps: 15 }, { weight_kg: at - offset, reps: 15 }),
    ).toBe(true);
  });
});

describe.each([
  { unit: "kg", heavy: 100, light: 97.5, exact: (n: number) => n },
  { unit: "lb", heavy: 225, light: 220, exact: (n: number) => n * KG_PER_LB },
] as const)("the reserve a set counted in $unit", ({ heavy, light, exact }) => {
  it("takes off only the reserve the estimate counted: 12 reps leave none to take", () => {
    // 12 reps at RPE 7 has no room for its three in reserve: the estimate reads 12, and so does
    // the conversion, so a heavier set of 12 beats a lighter one of 12.
    const worth = repsAtLoad({ weight_kg: exact(heavy), reps: 12, rpe: 7 }, exact(heavy));
    expect(worth).toBeCloseTo(12, 6);
    expect(
      fellShortOfSuggestion(
        { weight_kg: exact(light), reps: 12 },
        { weight_kg: exact(heavy), reps: 12, rpe: 7 },
      ),
    ).toBe(false);
  });

  it("counts one in reserve for 11 reps at RPE 6, the one that fitted under 12", () => {
    expect(repsAtLoad({ weight_kg: exact(heavy), reps: 11, rpe: 6 }, exact(heavy))).toBeCloseTo(
      11,
      6,
    );
    expect(
      fellShortOfSuggestion(
        { weight_kg: exact(light), reps: 11 },
        { weight_kg: exact(heavy), reps: 11, rpe: 6 },
      ),
    ).toBe(false);
  });
});

describe("the extra rep before a big jump", () => {
  const extra = (reps: number) =>
    prescriptionSchema.parse({
      exerciseId: "0192f0a0-0000-7000-8000-000000000001",
      revision: "0192f0a0-0000-7000-8000-0000000000a1",
      previousRevision: null,
      reason: "more_reps",
      incrementKg: 0,
      breakDays: null,
      capKg: null,
      sets: [a].map((id) => ({
        id,
        ghosts: { weight: 20, reps },
        outcome: { reason: "more_reps", ceiling: 18 },
      })),
    });

  it("is not a miss to make the top of the range, and is one to fall below it", () => {
    // 13 was asked on a range topping at 12.
    expect(suggestionLedger(extra(13), [done(a, 20, 12)])).toMatchObject({ total: 1, met: 1 });
    expect(suggestionLedger(extra(13), [done(a, 20, 13)])).toMatchObject({ met: 1 });
    expect(suggestionLedger(extra(13), [done(a, 20, 11)])).toMatchObject({ total: 1, met: 0 });
    // The offer itself still reads 13: the line under the exercise says what was suggested.
    expect(suggestionLedger(extra(13), [done(a, 20, 12)])?.suggested.reps).toBe(13);
  });
});
