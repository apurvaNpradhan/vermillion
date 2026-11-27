import { describe, expect, it } from "vitest";

import {
  finiteOutcome,
  latestAdjustment,
  prescriptionReadSchema,
  prescriptionSchema,
  revisedSets,
  setBasis,
  staleSets,
  type Prescription,
  type PrescriptionDraft,
} from "./prescription";

const EXERCISE = "0192f0a0-0000-7000-8000-000000000001";
const GYM_A = "0192f0a0-0000-7000-8000-0000000000a1";
const GYM_B = "0192f0a0-0000-7000-8000-0000000000b1";
const [one, two, three, four] = [1, 2, 3, 4].map((n) => `0192f0a0-0000-7000-8000-00000000001${n}`);
const id = (value: string | undefined) => value ?? "";

const target = { kind: "working", reps_min: 8, reps_max: 12 } as const;
const basis = setBasis("working", target);

function snapshot(extra: Partial<Prescription> = {}): Prescription {
  return prescriptionSchema.parse({
    exerciseId: EXERCISE,
    revision: "0192f0a0-0000-7000-8000-0000000000c1",
    previousRevision: null,
    reason: "add_weight",
    incrementKg: 2.5,
    breakDays: null,
    capKg: 100,
    gymId: GYM_A,
    sets: [one, two, three].map((setId) => ({
      id: setId,
      ghosts: { weight: 60, reps: 8 },
      outcome: null,
      basis,
    })),
    ...extra,
  });
}

const current = (done: readonly string[] = [], over: Record<string, string> = {}) =>
  [one, two, three].map((setId) => ({
    id: id(setId),
    basis: over[id(setId)] ?? basis,
    completed: done.includes(id(setId)),
  }));

describe("setBasis", () => {
  it("is the same for the same kind and target in any key order, and differs otherwise", () => {
    expect(setBasis("working", { kind: "working", reps_max: 12, reps_min: 8 })).toBe(basis);
    expect(setBasis("working", { kind: "working", reps_min: 8, reps_max: 10 })).not.toBe(basis);
    expect(setBasis("backoff", target)).not.toBe(basis);
    expect(setBasis("working", null)).toBe(setBasis("working", { kind: "working" }));
  });
});

describe("staleSets", () => {
  it("leaves a snapshot that still stands", () => {
    expect(staleSets(snapshot(), current(), GYM_A)).toBeNull();
    // A snapshot that recorded no basis or gym has nothing to compare.
    const bare = snapshot({
      gymId: undefined,
      sets: snapshot().sets.map(({ basis: _basis, ...rest }) => rest),
    });
    expect(staleSets(bare, current([], { [id(one)]: "other" }), GYM_B)).toBeNull();
  });

  it("replaces an unticked set whose kind or target changed, never a ticked one", () => {
    const edited = { [id(one)]: "x", [id(two)]: "y" };
    expect([...(staleSets(snapshot(), current([id(two)], edited), GYM_A) ?? [])]).toEqual([
      id(one),
    ]);
  });

  it("replaces every unticked set when the Session gym moved", () => {
    expect([...(staleSets(snapshot(), current([id(one)]), GYM_B) ?? [])]).toEqual([
      id(two),
      id(three),
    ]);
    // With nothing unticked it still revises, to record the gym.
    expect(staleSets(snapshot(), current([one, two, three].map(id)), null)).toEqual(new Set());
  });

  it("notices a set the snapshot never covered", () => {
    const added = [...current(), { id: id(four), basis, completed: false }];
    expect(staleSets(snapshot(), added, GYM_A)).toEqual(new Set());
  });
});

describe("revisedSets", () => {
  const fresh = (weight: number): PrescriptionDraft => ({
    exerciseId: EXERCISE,
    reason: "same_as_last",
    incrementKg: 0,
    breakDays: null,
    capKg: 80,
    gymId: GYM_B,
    sets: [one, two, three, four].map((setId) => ({
      id: id(setId),
      ghosts: { weight, reps: 10 },
      outcome: null,
      basis,
    })),
  });
  const adjusted = snapshot({
    sets: snapshot().sets.map((set, index) =>
      index === 0
        ? set
        : { ...set, ghosts: { ...set.ghosts, weight: 57.5 }, unadjustedWeightKg: 60 },
    ),
    adjustments: [
      {
        setId: id(one),
        reason: "reps_short",
        reps: 3,
        moved: [
          { id: id(two), fromKg: 60 },
          { id: id(three), fromKg: 60 },
        ],
      },
    ],
  });

  it("replaces the named sets, appends new ones, keeps ticked ones, and follows the draft", () => {
    const next = revisedSets(adjusted, fresh(50), new Set([id(two), id(three)]));
    expect(next.sets.map((set) => set.ghosts.weight)).toEqual([60, 50, 50, 50]);
    expect(next.sets[1]?.unadjustedWeightKg).toBeUndefined();
    expect(next).toMatchObject({ reason: "same_as_last", capKg: 80, gymId: GYM_B });
    // Everything the adjustment moved was replaced, so it goes.
    expect(
      latestAdjustment(
        prescriptionSchema.parse({ ...next, revision: adjusted.revision, previousRevision: null }),
      ),
    ).toBeNull();
  });

  it("keeps an adjustment while some of what it moved stays", () => {
    const next = revisedSets(adjusted, fresh(50), new Set([id(three)]));
    expect(next.adjustments?.[0]?.moved).toEqual([{ id: id(two), fromKg: 60 }]);
    expect(next.sets[1]?.ghosts.weight).toBe(57.5);
  });

  it("appends without replacing saved sets and adopts the current cap", () => {
    const next = revisedSets(adjusted, fresh(50), new Set());
    expect(next.sets.map((set) => set.ghosts.weight)).toEqual([60, 57.5, 57.5, 50]);
    expect(next).toMatchObject({ reason: "add_weight", capKg: 80, gymId: GYM_B });
    expect(next.adjustments).toHaveLength(1);
  });

  it("drops sets that are gone and the adjustment of a trigger that is gone", () => {
    const smaller = { ...fresh(50), sets: fresh(50).sets.slice(1, 3) };
    const next = revisedSets(adjusted, smaller, new Set());
    expect(next.sets.map(({ id: setId }) => setId)).toEqual([id(two), id(three)]);
    expect(next.adjustments).toBeUndefined();
  });
});

describe("prescriptionReadSchema", () => {
  const stored = JSON.parse(JSON.stringify(snapshot()));
  it("reads what this build wrote", () => {
    expect(prescriptionReadSchema.parse(stored)).toEqual(snapshot());
  });

  it("reads a newer build's snapshot by ignoring keys and reasons it does not know", () => {
    const newer = {
      ...stored,
      reason: "a_reason_from_later",
      extra: { nested: true },
      sets: stored.sets.map((set: Prescription["sets"][number]) => ({
        ...set,
        outcome: { reason: "another_later_reason" },
        future: 1,
        ghosts: { weight: 60, reps: 8, tempo: "3-1-1" },
      })),
    };
    expect(prescriptionSchema.safeParse(newer).success).toBe(false);
    const read = prescriptionReadSchema.parse(newer);
    expect(read.reason).toBeNull();
    expect(read.sets.map((set) => set.outcome)).toEqual([null, null, null]);
    expect(read.sets[0]?.ghosts).toEqual({ weight: 60, reps: 8 });
  });

  it("does not read what has no identity or sets", () => {
    expect(prescriptionReadSchema.safeParse({ ...stored, revision: "x" }).success).toBe(false);
    expect(prescriptionReadSchema.safeParse({ ...stored, sets: "none" }).success).toBe(false);
    expect(prescriptionReadSchema.safeParse(null).success).toBe(false);
  });
});

describe("finiteOutcome", () => {
  it("drops numbers that are not finite and keeps the rest", () => {
    expect(
      finiteOutcome({
        reason: "backoff_share",
        loadFactor: Number.NaN,
        share: 0.9,
        capKg: Infinity,
      }),
    ).toEqual({ reason: "backoff_share", share: 0.9 });
    expect(finiteOutcome({ reason: "add_weight", changeKg: 2.5 })).toEqual({
      reason: "add_weight",
      changeKg: 2.5,
    });
    expect(finiteOutcome(null)).toBeNull();
  });
});
