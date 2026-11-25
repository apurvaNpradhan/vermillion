import { describe, expect, it } from "vitest";

import type { FinishedSession } from "@workspace/sync";

import { buildGymLoads } from "../../gym/gym-loads";

import { deriveExercises, type DeriveInputs } from "./derive";
import { DEFAULT_INPUTS } from "./session-store";
import { exercise, set } from "./fixtures";

const inputs = (overrides: Partial<DeriveInputs> = {}): DeriveInputs => ({
  ...DEFAULT_INPUTS,
  ...overrides,
});
const context = { finished: false, workoutId: null };

const a = exercise("a", [set("a1", { weightKg: 60, reps: 8 }), set("a2", { weightKg: 60 })]);
const b = exercise("b", [set("b1"), set("b2")]);

describe("deriveExercises", () => {
  it("says how far each exercise is and what a finished one logged", () => {
    const open = deriveExercises([a], inputs(), context, new Map()).get("a");
    expect(open?.view.progress).toBe("0/2");
    expect(open?.view.summary).toBe("");
    const part = exercise("p", [
      set("p1", { weightKg: 9, reps: 10, completedAt: "2026-11-21T10:05:00.000Z" }),
      set("p2"),
    ]);
    const partial = deriveExercises([part], inputs(), context, new Map()).get("p");
    expect(partial?.view.progress).toBe("1/2");
    expect(partial?.view.summary).toBe("9 kg × 10");
    const done = exercise("d", [
      set("d1", { weightKg: 60, reps: 8, completedAt: "2026-11-21T10:05:00.000Z" }),
    ]);
    const finished = deriveExercises([done], inputs(), context, new Map()).get("d");
    expect(finished?.view.progress).toBe("1/1");
    expect(finished?.view.summary).toBe("60 kg × 8");
  });

  it("labels rows with their number and offers copy and fill only where they apply", () => {
    const view = deriveExercises([a], inputs(), context, new Map()).get("a")?.view;
    expect(view?.setIds).toEqual(["a1", "a2"]);
    expect(view?.rows.get("a1")).toMatchObject({
      badge: "1",
      number: 1,
      canRemove: true,
      canFillRemaining: true,
      canCopyPrevious: false,
    });
    expect(view?.rows.get("a2")).toMatchObject({ number: 2, canFillRemaining: false });
  });

  it("uses the Session gym's history and applies the active gym's cap to its ghost weight", () => {
    const machine = exercise("press", [set("p1")], {
      exercise: {
        equipment: "machine",
        primaryMuscle: "chest",
        secondaryMuscles: [],
        thumbnailKey: null,
      },
    });
    const date = "2026-11-21T10:00:00.000Z";
    const finished = (gymId: string, weight: number): FinishedSession => ({
      id: gymId,
      gymId,
      started_at: date,
      finished_at: date,
      title: "Press",
      durationS: 60,
      pausedMs: 0,
      workoutId: null,
      sets: [
        {
          id: gymId,
          exercise_id: machine.exerciseId,
          exercise_type: "weight_reps",
          kind: "working",
          completed_at: date,
          reps: 10,
          weight_kg: weight,
        },
      ],
    });
    const gym = buildGymLoads({
      gymId: "active",
      unit: "kg",
      kit: [],
      settings: [
        {
          exerciseId: machine.exerciseId,
          setupNote: null,
          loadRanges: [{ min: 5, max: 90, step: 5 }],
        },
      ],
    });
    const selected = inputs({
      gym,
      sessionGymId: "garage",
      previous: new Map([[machine.exerciseId, [finished("active", 70), finished("garage", 95)]]]),
    });
    const first = deriveExercises([machine], selected, context, new Map());
    expect(first.get(machine.id)?.view.rows.get("p1")).toMatchObject({
      previous: { weight_kg: 95 },
      ghosts: { weight: 90 },
      capKg: 90,
    });
    const switched = deriveExercises(
      [machine],
      { ...selected, sessionGymId: "active" },
      context,
      first,
    );
    expect(switched.get(machine.id)?.view.rows.get("p1")).toMatchObject({
      previous: { weight_kg: 70 },
      ghosts: { weight: 70 },
    });
  });

  it("waits for the history of an exercise before it counts as ready", () => {
    expect(deriveExercises([b], inputs(), context, new Map()).get("b")?.view.historyReady).toBe(
      false,
    );
    expect(
      deriveExercises([b], inputs({ previous: new Map([["lib-b", []]]) }), context, new Map()).get(
        "b",
      )?.view.historyReady,
    ).toBe(true);
    expect(
      deriveExercises([b], inputs({ historyFailed: true }), context, new Map()).get("b")?.view
        .historyReady,
    ).toBe(true);
  });

  it("rebuilds only the exercise whose sets changed", () => {
    const shared = inputs();
    const first = deriveExercises([a, b], shared, context, new Map());
    const ticked = exercise("b", [
      set("b1", { completedAt: "2026-11-21T10:05:00.000Z" }),
      set("b2"),
    ]);
    const second = deriveExercises([a, ticked], shared, context, first);
    expect(second.get("a")).toBe(first.get("a"));
    expect(second.get("b")).not.toBe(first.get("b"));
    expect(second.get("b")?.view.progress).toBe("1/2");
  });

  it("keeps the views and rows that did not change when an exercise is rebuilt", () => {
    const shared = inputs();
    const first = deriveExercises([b], shared, context, new Map());
    const typed = exercise("b", [set("b1"), set("b2", { reps: 5 })]);
    const second = deriveExercises([typed], shared, context, first);
    const before = first.get("b")?.view;
    const after = second.get("b")?.view;
    expect(after?.setIds).toBe(before?.setIds);
    expect(after?.rows.get("b1")).toBe(before?.rows.get("b1"));
    expect(after?.rows.get("b2")).toBe(before?.rows.get("b2"));
  });

  it("rebuilds views only for exercises whose history changed", () => {
    const before = inputs({ previous: new Map([["lib-b", []]]) });
    const first = deriveExercises([a, b], before, context, new Map());
    const after = inputs({
      previous: new Map([
        ["lib-a", []],
        ["lib-b", []],
      ]),
    });
    const second = deriveExercises([a, b], after, context, first);
    expect(second.get("b")?.view).toBe(first.get("b")?.view);
    expect(second.get("a")?.view.historyReady).toBe(true);
  });

  it("rebuilds every exercise when the inputs change", () => {
    const first = deriveExercises([a, b], inputs(), context, new Map());
    const second = deriveExercises([a, b], inputs({ unit: "lb" }), context, first);
    expect(second.get("a")).not.toBe(first.get("a"));
    expect(second.get("b")).not.toBe(first.get("b"));
  });
});
