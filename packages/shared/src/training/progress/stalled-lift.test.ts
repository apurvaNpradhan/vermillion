import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import {
  missedSuggestions,
  sessionScore,
  stalledSessions,
  type StallSession,
} from "./stalled-lift";
import { stalledExerciseIds, type SuggestionAccount } from "./suggestion-context";

const set = (weight: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  exercise_id: "e",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-01-01",
  weight_kg: weight,
  reps,
  ...extra,
});
const day = (offset: number) => new Date(Date.UTC(2026, 10, 16 - offset)).toISOString();
/** Sessions newest first, one set each, `gap` days apart. */
const history = (sets: LoggedSet[], gap = 4): StallSession[] =>
  sets.map((one, index) => ({ started_at: day(index * gap), sets: [one] }));

describe("sessionScore", () => {
  it("takes the best Counted set by estimated 1RM and ignores warm-ups and unticked sets", () => {
    const score = sessionScore(
      [
        set(100, 5),
        set(110, 3),
        set(200, 1, { kind: "warmup" }),
        set(300, 1, { completed_at: null }),
      ],
      "weight_reps",
    );
    expect(score).toBeCloseTo((110 * 36) / 34, 5); // 110 x 3 beats 100 x 5
  });

  it("uses best reps for reps-only exercises and effective weight for weighted bodyweight", () => {
    expect(sessionScore([set(0, 8), set(0, 12)], "reps_only")).toBe(12);
    const added = sessionScore([set(20, 5)], "bodyweight_weighted_reps", 80);
    expect(added).toBeCloseTo((100 * 36) / 32, 5);
  });

  it("is null without a scorable set", () => {
    expect(sessionScore([], "weight_reps")).toBeNull();
    expect(sessionScore([set(60, 20)], "weight_reps")).toBe(1200);
    expect(sessionScore([set(60, 5)], "duration")).toBeNull();
  });
});

describe("stalledSessions", () => {
  it("needs at least four Sessions", () => {
    expect(stalledSessions(history([set(100, 5), set(100, 5), set(100, 5)]), "weight_reps")).toBe(
      0,
    );
  });

  it("is stalled when the last three have not improved on the reference", () => {
    expect(
      stalledSessions(history([set(100, 5), set(100, 5), set(100, 4), set(100, 5)]), "weight_reps"),
    ).toBe(3);
  });

  describe("sets of more than 12 reps (no estimated 1RM)", () => {
    it("compares reps at the same load when e1RM is unavailable", () => {
      const improving = history([set(60, 20), set(60, 15), set(60, 15), set(60, 15)]);
      expect(stalledSessions(improving, "weight_reps")).toBe(0);
      const flat = history([set(60, 15), set(60, 15), set(60, 15), set(60, 15)]);
      expect(stalledSessions(flat, "weight_reps")).toBe(3);
    });
  });

  it("counts heavier loads at the minimum even below a 1% gain in e1RM", () => {
    const flat = [set(100, 5), set(100, 5), set(100, 5)];
    expect(stalledSessions(history([set(100.5, 5), ...flat]), "weight_reps")).toBe(0);
    const target = { kind: "working", reps_min: 5, reps_max: 8 } as const;
    expect(stalledSessions(history([set(100.5, 4, { target }), ...flat]), "weight_reps")).toBe(3);
  });

  it("counts a 1% gain in e1RM even when load goes down", () => {
    expect(
      stalledSessions(history([set(95, 8), set(100, 5), set(100, 5), set(100, 5)]), "weight_reps"),
    ).toBe(0);
  });

  it("counts how long it has stalled past three Sessions", () => {
    const stalled = history([
      set(100, 5),
      set(100, 5),
      set(100, 5),
      set(100, 5),
      set(100, 5),
      set(90, 5),
    ]);
    expect(stalledSessions(stalled, "weight_reps")).toBe(4);
  });

  it("is not a stall when one of the three came after a gap of 14 days or more", () => {
    const sessions = history([set(100, 5), set(100, 5), set(100, 5), set(100, 5)]);
    expect(stalledSessions(sessions, "weight_reps")).toBe(3);
    const gap = sessions.map((session, index) => ({
      ...session,
      started_at: day(index === 3 ? 12 + 14 : index * 4),
    }));
    expect(stalledSessions(gap, "weight_reps")).toBe(0);
    // A gap older than the window is not a break for the recent three.
    const older = [...sessions, { started_at: day(80), sets: [set(100, 5)] }];
    expect(stalledSessions(older, "weight_reps")).toBeGreaterThan(0);
  });

  it("works for reps-only and weighted bodyweight lifts", () => {
    const reps = (n: number) => set(0, n, { exercise_type: "reps_only" });
    expect(stalledSessions(history([reps(10), reps(10), reps(10), reps(10)]), "reps_only")).toBe(3);
    expect(stalledSessions(history([reps(12), reps(10), reps(10), reps(10)]), "reps_only")).toBe(0);
  });

  it("ignores Sessions in a Lighter week", () => {
    const sessions = history([set(60, 5), set(100, 5), set(100, 5), set(100, 4), set(100, 5)]);
    const week = { from: day(1), until: day(-1) };
    expect(stalledSessions(sessions, "weight_reps", { lighterWeeks: [week] })).toBe(3);
    expect(stalledSessions(sessions, "weight_reps")).toBe(0);
  });
});

describe("stalledExerciseIds", () => {
  const account: SuggestionAccount = {
    previousSource: "any_session",
    unit: "kg",
    weightIncrementKg: null,
    lighterWeeks: [],
    bodyweightKg: null,
    stallMemory: () => ({ dismissed: false, applied: false }),
  };
  const inWorkout = (sessions: StallSession[], workoutId: string | null = "w1") =>
    sessions.map((session) => ({
      ...session,
      id: session.started_at,
      finished_at: session.started_at,
      workoutId,
    }));
  const stalledHistory = () =>
    inWorkout(history([set(100, 5), set(100, 5), set(100, 4), set(100, 5)]));
  const week = (exerciseId: string, workoutId: string | null = "w1") => ({
    workoutId,
    sets: [set(100, 5, { exercise_id: exerciseId })],
  });

  it("lists the exercises trained this week that have stalled, once each", () => {
    const histories = new Map([
      ["a", stalledHistory()],
      ["b", inWorkout(history([set(120, 5), set(100, 5), set(100, 5), set(100, 5)]))],
    ]);
    expect(stalledExerciseIds([week("a"), week("b"), week("a")], histories, account)).toEqual([
      "a",
    ]);
  });

  it("judges an exercise on the history of the Workout it was trained in", () => {
    const histories = new Map([["a", stalledHistory()]]);
    // A Workout without enough Sessions cannot borrow a stall from another one.
    expect(stalledExerciseIds([week("a", "w2")], histories, account)).toEqual([]);
    expect(stalledExerciseIds([week("c")], histories, account)).toEqual([]);
  });

  it("matches duplicate entries by source and skips a snoozed stall", () => {
    const row = (entry: string, index: number, weight: number) =>
      set(weight, 5, {
        session_exercise_id: `${entry}-${index}`,
        source_workout_exercise_id: entry,
      });
    const sessions = inWorkout(
      [0, 1, 2, 3].map((index) => {
        const growing = row("growing", index, 120 - index * 5);
        const stalled = row("stalled", index, 100);
        return {
          started_at: day(index * 4),
          sets: index % 2 === 0 ? [growing, stalled] : [stalled, growing],
        };
      }),
    );
    const histories = new Map([["e", sessions]]);
    const thisWeek = sessions.slice(0, 1);
    expect(stalledExerciseIds(thisWeek, histories, account)).toEqual(["e"]);
    expect(
      stalledExerciseIds(thisWeek, histories, {
        ...account,
        stallMemory: (exerciseId, latestSessionId) => ({
          dismissed: exerciseId === "e" && latestSessionId === sessions[0]?.id,
          applied: false,
        }),
      }),
    ).toEqual([]);
    const replacement = { workoutId: "w1", sets: [row("growing", 4, 125), row("new", 4, 100)] };
    expect(stalledExerciseIds([replacement], histories, account)).toEqual([]);
  });
});

describe("missedSuggestions", () => {
  const suggested = (weight: number | null, reps: number | null) => ({
    suggested: { weight_kg: weight, reps },
  });
  /** A Session of two working sets against a suggestion of 100 kg for 8. */
  const session = (index: number, done: [number, number][], extra: Partial<StallSession> = {}) =>
    ({
      started_at: day(index * 4),
      sets: done.map(([weight, reps]) => set(weight, reps, suggested(100, 8))),
      ...extra,
    }) satisfies StallSession;
  const miss = (index: number) =>
    session(index, [
      [100, 6],
      [100, 5],
    ]);
  const met = (index: number) =>
    session(index, [
      [100, 8],
      [100, 8],
    ]);

  it("counts a run of three Sessions that fell short, even while the numbers still move", () => {
    expect(missedSuggestions([miss(0), miss(1), miss(2)])).toBe(3);
    expect(missedSuggestions([miss(0), miss(1), miss(2), miss(3), met(4)])).toBe(4);
  });

  it("is not stalled with two misses, or when one of the last three met it", () => {
    expect(missedSuggestions([miss(0), miss(1)])).toBe(0);
    expect(missedSuggestions([miss(0), met(1), miss(2), miss(3)])).toBe(0);
  });

  it("reads less load as a miss too, and needs more than half of the sets short", () => {
    const light = (index: number) =>
      session(index, [
        [95, 8],
        [95, 8],
      ]);
    expect(missedSuggestions([light(0), light(1), light(2)])).toBe(3);
    const half = (index: number) =>
      session(index, [
        [100, 8],
        [100, 6],
      ]);
    expect(missedSuggestions([half(0), half(1), half(2)])).toBe(0);
  });

  it("ends at a Session with no snapshot, and ignores warm-ups and unticked sets", () => {
    const older: StallSession = { started_at: day(8), sets: [set(100, 8)] };
    expect(missedSuggestions([miss(0), miss(1), older, miss(3)])).toBe(0);
    const noisy = {
      started_at: day(0),
      sets: [
        set(40, 3, { ...suggested(40, 10), kind: "warmup" }),
        set(100, 8, { ...suggested(100, 8), completed_at: null }),
        ...miss(0).sets,
      ],
    } satisfies StallSession;
    expect(missedSuggestions([noisy, miss(1), miss(2)])).toBe(3);
  });

  it("skips Test and Deload Sessions and stops at an applied stall deload", () => {
    const deload = { ...miss(1), phase: "deload" } satisfies StallSession;
    expect(missedSuggestions([miss(0), deload, miss(2), miss(3)])).toBe(3);
    const applied = session(2, [[90, 8]], {}).sets.map((one) => ({ ...one, stall_deload: true }));
    expect(
      missedSuggestions([
        miss(0),
        miss(1),
        { started_at: day(8), sets: applied },
        miss(3),
        miss(4),
      ]),
    ).toBe(0);
  });

  it("compares loads typed in lb by their identity", () => {
    // 135 lb suggested, 130 lb done: a different load, so a miss; the same load is not.
    const lb = (index: number, weightLb: number) => ({
      started_at: day(index * 4),
      sets: [set(weightLb * 0.45359237, 8, suggested(135 * 0.45359237, 8))],
    });
    expect(missedSuggestions([lb(0, 130), lb(1, 130), lb(2, 130)])).toBe(3);
    expect(missedSuggestions([lb(0, 135), lb(1, 135), lb(2, 135)])).toBe(0);
  });
});
