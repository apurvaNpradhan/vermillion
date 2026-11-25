import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { prescriptionSchema, revisedSets, type PrescriptionDraft } from "../progress/prescription";
import { rangeGrid } from "../progress/load-grid";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import { suggestNext } from "./pipeline";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-01T12:00:00Z");
const target: PlannedSet = { kind: "working", reps_min: 8, reps_max: 12 };
const plan: PlannedSet[] = [target, target, target];

describe.each([
  { unit: "kg", load: 60, even: 100, dumbbell: 12.5, lower: 10 },
  { unit: "lb", load: 135, even: 225, dumbbell: 30, lower: 25 },
] as const)("evidence in $unit", ({ unit, load, even, dumbbell, lower }) => {
  const kg = (value: number) => parseWeight(String(value), unit) ?? 0;
  const settings = { weightUnit: unit, weightIncrementKg: null };
  const session = (
    id: string,
    daysAgo: number,
    weight: number,
    reps: readonly number[],
    extra: Partial<LoggedSet>[] = [],
  ) => {
    const at = new Date(NOW - daysAgo * DAY).toISOString();
    return {
      id,
      started_at: at,
      sets: [
        ...extra.map((set, index): LoggedSet => ({
          id: `${id}-extra-${index}`,
          exercise_id: "lift",
          exercise_type: "weight_reps",
          kind: "warmup",
          completed_at: at,
          weight_kg: kg(weight / 2),
          reps: 10,
          ...set,
        })),
        ...reps.map((count, index): LoggedSet => ({
          id: `${id}-${index}`,
          exercise_id: "lift",
          exercise_type: "weight_reps",
          kind: "working",
          completed_at: at,
          weight_kg: kg(weight),
          reps: count,
          target,
        })),
      ],
    };
  };
  const ask = (
    history: ReturnType<typeof session>[],
    context: Parameters<typeof suggestNext>[5] extends infer C ? Partial<C> : never = {},
    equipment: Parameters<typeof suggestNext>[3] = "barbell",
  ) =>
    suggestNext(plan, history, "weight_reps", equipment, settings, {
      now: new Date(NOW),
      ...context,
    });

  it("names the Session it read and the progressing sets it compared, not the warm-ups", () => {
    const result = ask([
      session("newest", 3, load, [12, 12, 11], [{}]),
      session("older", 10, load - 5, [10, 10, 10]),
    ]);
    expect(result?.evidence).toEqual({
      baseline: {
        id: "newest",
        at: new Date(NOW - 3 * DAY).toISOString(),
        sets: [
          { kind: "working", weightKg: kg(load), reps: 12 },
          { kind: "working", weightKg: kg(load), reps: 12 },
          { kind: "working", weightKg: kg(load), reps: 11 },
        ],
      },
    });
  });

  it("gives the factor and the days of a break", () => {
    const result = ask([session("away", 23, load, [10, 10, 10])]);
    expect(result?.reason).toBe("after_break");
    expect(result?.evidence?.factor).toEqual({ source: "break", share: 0.9, days: 23 });
    expect(result?.evidence?.baseline?.id).toBe("away");
  });

  it("names a Deload and a load the grid moved much further than the cut", () => {
    const grid = rangeGrid([
      {
        min: kg(dumbbell > 20 ? 5 : 2.5),
        max: kg(dumbbell * 3),
        step: kg(dumbbell > 20 ? 5 : 2.5),
      },
    ]);
    const result = ask(
      [session("last", 3, dumbbell, [12, 12, 12])],
      { phaseLoad: 0.9, grid },
      "dumbbell",
    );
    expect(result?.reason).toBe("deload");
    expect(result?.evidence?.factor).toEqual({ source: "deload", share: 0.9 });
    expect(result?.evidence?.snapped).toEqual({
      source: "grid",
      fromKg: expect.closeTo(kg(dumbbell), 3),
      toKg: expect.closeTo(kg(lower), 3),
    });
  });

  it("does not name snapping when the cut is the one asked for", () => {
    const result = ask([session("last", 3, even, [12, 12, 12])], { phaseLoad: 0.9 });
    expect(result?.reason).toBe("deload");
    expect(result?.evidence?.snapped).toBeUndefined();
  });

  it("names the cap a load came down to", () => {
    const pin = kg(5);
    const cap = pin * ((load - 10) / 5);
    const grid = rangeGrid([{ min: pin, max: cap, step: pin }]);
    const result = ask([session("heavy", 3, load, [10, 10, 10])], { grid }, "machine");
    expect(result?.reason).toBe("capped");
    expect(result?.evidence?.snapped).toEqual({
      source: "cap",
      fromKg: kg(load),
      toKg: expect.closeTo(cap, 3),
    });
  });

  it("is kept in a Session's snapshot and follows a revision of it", () => {
    const evidence = ask([session("newest", 3, load, [12, 12, 12])])?.evidence;
    const ids = ["0192f0a0-0000-7000-8000-000000000001", "0192f0a0-0000-7000-8000-000000000002"];
    const draft = (value: typeof evidence): PrescriptionDraft => ({
      exerciseId: "0192f0a0-0000-7000-8000-0000000000e1",
      reason: "add_weight",
      incrementKg: 2.5,
      breakDays: null,
      capKg: null,
      ...(value ? { evidence: value } : {}),
      sets: ids.map((id) => ({ id, ghosts: { weight: kg(load), reps: 8 }, outcome: null })),
    });
    const snapshot = prescriptionSchema.parse({
      ...draft(evidence),
      revision: "0192f0a0-0000-7000-8000-0000000000a1",
      previousRevision: null,
    });
    expect(snapshot.evidence?.baseline?.id).toBe("newest");
    // A replaced set takes the draft's evidence; a revision that replaces nothing keeps the saved.
    const newer = ask([session("other", 1, load + 5, [12, 12, 12])])?.evidence;
    expect(revisedSets(snapshot, draft(newer), new Set(ids)).evidence?.baseline?.id).toBe("other");
    expect(revisedSets(snapshot, draft(newer), new Set()).evidence?.baseline?.id).toBe("newest");
    // A snapshot made before evidence existed still reads.
    expect(
      prescriptionSchema.safeParse({
        ...draft(undefined),
        revision: "0192f0a0-0000-7000-8000-0000000000a2",
        previousRevision: null,
      }).success,
    ).toBe(true);
    expect(KG_PER_LB).toBeGreaterThan(0);
  });
});
