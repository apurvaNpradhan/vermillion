import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  currentAction,
  orderedSets,
  sessionStats,
  valueParts,
  valuesText,
  type DisplayValue,
} from "./current-action";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

type SetInit = Partial<SessionSetDetail>;
const set = (id: string, init: SetInit = {}): SessionSetDetail => ({
  id,
  position: id,
  kind: "working",
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: null,
  completedAt: null,
  timerStartedAt: null,
  target: null,
  ...init,
});
const exercise = (
  id: string,
  sets: SessionSetDetail[],
  init: Partial<SessionExerciseDetail> = {},
): SessionExerciseDetail => ({
  id,
  exerciseId: `lib-${id}`,
  title: `Title ${id}`,
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: id,
  restSeconds: 90,
  note: null,
  supersetGroup: null,
  logEffort: false,
  exercise: null,
  sets,
  ...init,
});
const session = (
  exercises: SessionExerciseDetail[],
  rest: SessionDetail["rest"] = null,
): SessionDetail => ({
  id: "s",
  workoutId: null,
  programId: null,
  runId: null,
  slotId: null,
  cycle: null,
  title: "Push",
  titleDerived: false,
  note: null,
  startedAt: at(0),
  finishedAt: null,
  durationS: null,
  deviceId: "d",
  rest,
  exercises,
});
const noGhosts = () => ({});

describe("orderedSets", () => {
  it("goes top to bottom for lone exercises and by rounds in a superset", () => {
    const list = orderedSets([
      exercise("a", [set("a1"), set("a2")]),
      exercise("b", [set("b1"), set("b2"), set("b3")], { supersetGroup: "g" }),
      exercise("c", [set("c1")], { supersetGroup: "g" }),
      exercise("d", [set("d1")]),
    ]);
    expect(list.map((item) => item.set.id)).toEqual(["a1", "a2", "b1", "c1", "b2", "b3", "d1"]);
  });
});

describe("currentAction: the current set", () => {
  it("is the first unticked set, with its place in the exercise", () => {
    const s = session([
      exercise("a", [set("a1", { completedAt: at(60) }), set("a2"), set("a3")]),
      exercise("b", [set("b1")]),
    ]);
    const action = currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 100_000 });
    expect(action.current).toMatchObject({ setId: "a2", index: 1, total: 3, title: "Title a" });
    expect(action.setsDone).toBe(1);
    expect(action.setsTotal).toBe(4);
    expect(action.allDone).toBe(false);
  });

  it("skips ticked sets that come later and follows an earlier gap", () => {
    const s = session([exercise("a", [set("a1"), set("a2", { completedAt: at(60) })])]);
    expect(currentAction({ session: s, ghostsFor: noGhosts, now: T0 }).current?.setId).toBe("a1");
  });

  it("follows the superset rounds", () => {
    const s = session([
      exercise("a", [set("a1", { completedAt: at(10) }), set("a2")], { supersetGroup: "g" }),
      exercise("b", [set("b1"), set("b2")], { supersetGroup: "g" }),
    ]);
    const action = currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 20_000 });
    expect(action.current?.setId).toBe("b1");
    expect(action.next).toEqual({ kind: "exercise", title: "Title a" });
  });

  it("shows typed values, else ghost values", () => {
    const s = session([exercise("a", [set("a1", { weightKg: 82.5 })])]);
    const action = currentAction({
      session: s,
      ghostsFor: () => ({ weight: 80, reps: 8 }),
      now: T0,
    });
    expect(action.current?.values).toEqual([
      { field: "weight", value: 82.5, ghost: false },
      { field: "reps", value: 8, ghost: true },
    ]);
    expect(action.current?.empty).toBe(false);
  });

  it("is empty when nothing is typed and there is no ghost", () => {
    const s = session([exercise("a", [set("a1")])]);
    const action = currentAction({ session: s, ghostsFor: noGhosts, now: T0 });
    expect(action.current?.empty).toBe(true);
    expect(action.current?.values).toEqual([
      { field: "weight", value: null, ghost: false },
      { field: "reps", value: null, ghost: false },
    ]);
  });

  it("reports the running timer of a duration set with its target", () => {
    const s = session(
      [
        exercise(
          "a",
          [set("a1", { timerStartedAt: at(5), target: { kind: "working", duration_s: 45 } })],
          { type: "duration" },
        ),
      ],
      null,
    );
    const action = currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 10_000 });
    expect(action.current?.timer).toEqual({ startedAt: at(5), target: 45 });
  });

  it("has no current set when everything is ticked", () => {
    const s = session([exercise("a", [set("a1", { completedAt: at(5) })])]);
    const action = currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 10_000 });
    expect(action).toMatchObject({ current: null, next: null, allDone: true, setsDone: 1 });
  });

  it("is not done with no sets at all", () => {
    const action = currentAction({ session: session([]), ghostsFor: noGhosts, now: T0 });
    expect(action).toMatchObject({ current: null, allDone: false, setsTotal: 0 });
  });
});

describe("currentAction: next", () => {
  it("is Set n of the same exercise", () => {
    const s = session([exercise("a", [set("a1"), set("a2"), set("a3")])]);
    expect(currentAction({ session: s, ghostsFor: noGhosts, now: T0 }).next).toEqual({
      kind: "set",
      number: 2,
    });
  });

  it("is the next exercise's title across exercises", () => {
    const s = session([exercise("a", [set("a1")]), exercise("b", [set("b1")])]);
    expect(currentAction({ session: s, ghostsFor: noGhosts, now: T0 }).next).toEqual({
      kind: "exercise",
      title: "Title b",
    });
  });

  it("skips ticked sets", () => {
    const s = session([exercise("a", [set("a1"), set("a2", { completedAt: at(1) }), set("a3")])]);
    expect(currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 5000 }).next).toEqual({
      kind: "set",
      number: 3,
    });
  });
});

describe("currentAction: phase and work start", () => {
  const sets = [exercise("a", [set("a1", { completedAt: at(100) }), set("a2"), set("a3")])];

  it("is work counted from the last tick", () => {
    const action = currentAction({
      session: session(sets),
      ghostsFor: noGhosts,
      now: T0 + 130_000,
    });
    expect(action.phase).toBe("work");
    expect(action.rest).toBeNull();
    expect(action.workStartedAt).toBe(at(100));
  });

  it("is work counted from the session start before any tick", () => {
    const s = session([exercise("a", [set("a1")])]);
    expect(currentAction({ session: s, ghostsFor: noGhosts, now: T0 + 30_000 }).workStartedAt).toBe(
      at(0),
    );
  });

  it("is rest while a Rest runs", () => {
    const rest = { setId: "a1", startedAt: at(100), endsAt: at(190) };
    const action = currentAction({
      session: session(sets, rest),
      ghostsFor: noGhosts,
      now: T0 + 130_000,
    });
    expect(action.phase).toBe("rest");
    expect(action.rest).toEqual({ remaining: 60, total: 90, running: true });
    expect(action.workStartedAt).toBe(at(100));
  });

  it("counts work from the end of a Rest that ran out", () => {
    const rest = { setId: "a1", startedAt: at(100), endsAt: at(190) };
    const action = currentAction({
      session: session(sets, rest),
      ghostsFor: noGhosts,
      now: T0 + 250_000,
    });
    expect(action.phase).toBe("work");
    expect(action.workStartedAt).toBe(at(190));
  });

  it("counts work from a Rest that was skipped, when the screen saw it", () => {
    const action = currentAction({
      session: session(sets),
      ghostsFor: noGhosts,
      now: T0 + 250_000,
      restEndedAt: T0 + 140_000,
    });
    expect(action.workStartedAt).toBe(at(140));
  });

  it("ignores a Rest end in the future", () => {
    const rest = { setId: "a1", startedAt: at(100), endsAt: at(400) };
    const action = currentAction({
      session: session(sets, rest),
      ghostsFor: noGhosts,
      now: T0 + 130_000,
    });
    expect(action.workStartedAt).toBe(at(100));
  });
});

describe("sessionStats", () => {
  it("counts volume, sets done, elapsed and the average gap between ticks", () => {
    const s = session([
      exercise("a", [
        set("a1", { weightKg: 100, reps: 5, completedAt: at(60) }),
        set("a2", { weightKg: 100, reps: 5, completedAt: at(180) }),
        set("a3", { weightKg: 100, reps: 5, completedAt: at(360) }),
        set("a4"),
      ]),
    ]);
    const stats = sessionStats({ session: s, bodyweightKg: null, now: T0 + 400_000 });
    expect(stats).toEqual({
      volumeKg: 1500,
      setsDone: 3,
      setsTotal: 4,
      elapsedS: 400,
      averageRestS: 150,
    });
  });

  it("leaves a break out of the average and has none below two ticks", () => {
    const s = session([
      exercise("a", [
        set("a1", { weightKg: 50, reps: 5, completedAt: at(60) }),
        set("a2", { weightKg: 50, reps: 5, completedAt: at(120) }),
        set("a3", { weightKg: 50, reps: 5, completedAt: at(120 + 3600) }),
      ]),
    ]);
    expect(sessionStats({ session: s, bodyweightKg: null, now: T0 + 4000_000 }).averageRestS).toBe(
      60,
    );
    const one = session([exercise("a", [set("a1", { completedAt: at(60) })])]);
    expect(sessionStats({ session: one, bodyweightKg: null, now: T0 }).averageRestS).toBeNull();
  });
});

describe("valuesText", () => {
  const values = (items: [DisplayValue["field"], number | null][]): DisplayValue[] =>
    items.map(([field, value]) => ({ field, value, ghost: false }));

  it("writes weight and reps as 80 kg × 8", () => {
    expect(
      valuesText(
        values([
          ["weight", 80],
          ["reps", 8],
        ]),
        "kg",
        "kg",
      ),
    ).toBe("80 kg × 8");
  });
  it("joins other values", () => {
    expect(
      valuesText(
        values([
          ["distance", 400],
          ["duration", 90],
        ]),
        "kg",
        "kg",
      ),
    ).toBe("400 · 1:30");
    expect(valuesText(values([["reps", 12]]), "kg", "kg")).toBe("12");
  });
  it("drops what is not known", () => {
    expect(
      valuesText(
        values([
          ["weight", null],
          ["reps", 8],
        ]),
        "kg",
        "kg",
      ),
    ).toBe("8");
    expect(
      valuesText(
        values([
          ["weight", null],
          ["reps", null],
        ]),
        "kg",
        "kg",
      ),
    ).toBe("");
  });
});

describe("valueParts", () => {
  it("keeps the field of each known value, with the unit on weight", () => {
    expect(
      valueParts(
        [
          { field: "weight", value: 80, ghost: false },
          { field: "reps", value: null, ghost: false },
          { field: "duration", value: 30, ghost: true },
        ],
        "kg",
        "kg",
      ),
    ).toEqual([
      { field: "weight", text: "80 kg" },
      { field: "duration", text: "0:30" },
    ]);
  });
});
