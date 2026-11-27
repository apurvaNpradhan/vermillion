import { describe, expect, it } from "vitest";

import { prescriptionSchema } from "@workspace/shared";
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

  it("labels rows with their badge and offers copy and fill only where they apply", () => {
    const view = deriveExercises([a], inputs(), context, new Map()).get("a")?.view;
    expect(view?.setIds).toEqual(["a1", "a2"]);
    expect(view?.rows.get("a1")).toMatchObject({
      badge: "1",
      canRemove: true,
      canFillRemaining: true,
      canCopyPrevious: false,
    });
    expect(view?.rows.get("a2")).toMatchObject({ badge: "2", canFillRemaining: false });
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

  describe("a Session's suggestion from another gym's history", () => {
    const planned = exercise(
      "press",
      [set("p1", { target: { kind: "working", reps_min: 8, reps_max: 12 } })],
      {
        sourceWorkoutExerciseId: "plan",
        exercise: {
          equipment: "machine",
          primaryMuscle: "chest",
          secondaryMuscles: [],
          thumbnailKey: null,
        },
      },
    );
    const at = (gymId: string, weight: number, started: string): FinishedSession => ({
      id: `${gymId}-${started}`,
      gymId,
      started_at: started,
      finished_at: started,
      title: "Press",
      durationS: 60,
      pausedMs: 0,
      workoutId: null,
      sets: [
        {
          id: `${gymId}-${started}`,
          exercise_id: planned.exerciseId,
          exercise_type: "weight_reps",
          kind: "working",
          completed_at: started,
          reps: 12,
          weight_kg: weight,
        },
      ],
    });
    const ghost = (history: FinishedSession[], over: Partial<DeriveInputs> = {}) =>
      deriveExercises(
        [planned],
        inputs({
          sessionGymId: "garage",
          previous: new Map([[planned.exerciseId, history]]),
          ...over,
        }),
        context,
        new Map(),
      ).get(planned.id)?.view;
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

    it("reads the loads from this gym and the break from every gym", () => {
      // Trained at another gym two days ago: no break, whatever this gym's last Session was.
      const view = ghost([at("active", 70, daysAgo(2)), at("garage", 40, daysAgo(40))]);
      expect(view?.suggestion?.reason).toBe("add_weight");
      expect(view?.suggestion?.breakDays).toBeNull();
      expect(view?.rows.get("p1")?.ghosts.weight).toBeGreaterThan(40);
      expect(view?.rows.get("p1")?.ghosts.weight).toBeLessThan(70);
    });

    it.each(["kg", "lb"] as const)(
      "uses the current Workout's baseline with the break clock across Workouts in %s",
      (unit) => {
        const yesterday = { ...at("active", 50, daysAgo(1)), workoutId: "other" };
        const old = { ...at("garage", 60, daysAgo(49)), workoutId: "current" };
        const view = deriveExercises(
          [planned],
          inputs({
            unit,
            previousSource: "same_workout",
            sessionGymId: "garage",
            previous: new Map([[planned.exerciseId, [yesterday, old]]]),
          }),
          { ...context, workoutId: "current" },
          new Map(),
        ).get(planned.id)?.view;
        expect(view?.suggestion).toMatchObject({ reason: "add_weight", breakDays: null });
        expect(view?.rows.get("p1")?.previous?.weight_kg).toBe(60);
        expect(view?.rows.get("p1")?.ghosts.weight).toBeGreaterThan(60);
      },
    );

    it("still takes a break from a long absence from every gym", () => {
      const view = ghost([at("garage", 40, daysAgo(40)), at("active", 70, daysAgo(45))]);
      expect(view?.suggestion?.reason).toBe("after_break");
    });

    it("counts a stall across gyms", () => {
      const stalled = (gym: string, day: number): FinishedSession => ({
        ...at(gym, 60, daysAgo(day)),
        sets: [{ ...at(gym, 60, daysAgo(day)).sets[0]!, reps: 8 }],
      });
      const history = [
        stalled("active", 1),
        stalled("garage", 4),
        stalled("active", 8),
        stalled("garage", 11),
      ];
      const here = ghost(history)?.stall;
      const there = ghost(history, { sessionGymId: "active" })?.stall;
      expect(here?.count).toBeGreaterThan(0);
      expect(there?.count).toBe(here?.count);
      const otherWorkout = history.map((session, index) =>
        index === 0 ? session : { ...session, workoutId: "other" },
      );
      expect(ghost(otherWorkout, { previousSource: "any_session" })?.stall).toBeNull();
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

  it("shows Previous as loading until the history is read, even with a stored prescription", () => {
    const stored = prescriptionSchema.parse({
      exerciseId: "0192f0a0-0000-7000-8000-0000000000e1",
      revision: "0192f0a0-0000-7000-8000-0000000000a1",
      previousRevision: null,
      reason: "hold_missed",
      incrementKg: 2.5,
      breakDays: null,
      capKg: null,
      sets: [
        {
          id: "0192f0a0-0000-7000-8000-000000000001",
          ghosts: { weight: 50, reps: 8 },
          outcome: { reason: "hold_missed" },
        },
      ],
    });
    const resumed = { ...b, prescription: stored };
    const view = (input: Partial<DeriveInputs>) =>
      deriveExercises([resumed], inputs(input), context, new Map()).get("b")?.view;
    // A resumed Session has its snapshot at once, so it may be ticked, but Previous is still unread.
    expect(view({})).toMatchObject({ historyReady: true, previousReady: false });
    expect(view({ previous: new Map([["lib-b", []]]) })?.previousReady).toBe(true);
    expect(view({ historyFailed: true })?.previousReady).toBe(true);
  });

  it("shows Previous while equipment and bodyweight are still loading", () => {
    const previous = new Map([["lib-b", []]]);
    const view = (input: Partial<DeriveInputs>) =>
      deriveExercises([b], inputs(input), context, new Map()).get("b")?.view;

    expect(view({ previous, prescriptionReady: false })).toMatchObject({
      previousReady: true,
      historyReady: false,
      prescriptionDraft: null,
    });
    expect(view({ previous, previousPreferencesReady: false })?.previousReady).toBe(false);
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
