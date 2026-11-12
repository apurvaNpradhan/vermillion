import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { createI18n } from "@workspace/i18n";
import { describe, expect, it } from "vitest";
import { workoutLivePayloadSchema, workoutLiveState } from "./workout-live-state";
import { loggingGhosts } from "./logging-ghosts";

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

const t = createI18n("en").t;
const state = (s: SessionDetail, now = T0 + 60_000, restEndedAt: number | null = null) =>
  workoutLiveState({
    session: s,
    now,
    restEndedAt,
    ghostsFor: () => ({ weight: 80, reps: 8 }),
    unit: "kg",
    options: { weightUnit: "kg", weightIncrementKg: null, soundOn: false },
    url: "vermillion:///session/s/timer",
    t,
  });
describe("workout live notification", () => {
  it("shows the same current set and values as the Timer, with stable native clock timestamps", () => {
    const s = session([exercise("a", [set("1"), set("2")])]);
    expect(state(s)).toMatchObject({
      phase: "work",
      text: "Title a · Set 1 of 2 · 80 kg × 8",
      next: "Next: Set 2",
      sessionStartedAtMs: T0,
      canComplete: true,
    });
    expect(state(s, T0 + 61_000)).toEqual(state(s));
  });
  it("carries the countdown deadline and exercise segment progress without per-second changes", () => {
    const s = session([exercise("a", [set("1", { completedAt: at(30) }), set("2")])], {
      setId: "1",
      startedAt: at(30),
      endsAt: at(120),
    });
    expect(state(s)).toMatchObject({
      phase: "rest",
      restEndsAtMs: T0 + 120_000,
      segments: [{ total: 2, done: 1 }],
      text: "Rest · next: Set 2 of 2",
      restOver: "Rest over · Set 2 of 2 next",
    });
    expect(state(s, T0 + 61_000)).toEqual(state(s));
    expect(state(s, T0 + 121_000).phase).toBe("work");
  });
  it("counts work from Skip instead of including the skipped rest", () => {
    const s = session([exercise("a", [set("1", { completedAt: at(10) }), set("2")])]);
    expect(state(s, T0 + 60_000, T0 + 40_000).workStartedAtMs).toBe(T0 + 40_000);
  });
  it("words the last rest without a next set", () => {
    const s = session([exercise("a", [set("1", { completedAt: at(30) })])], {
      setId: "1",
      startedAt: at(30),
      endsAt: at(120),
    });
    expect(state(s)).toMatchObject({
      text: "Rest · last set done",
      restOver: "Rest over · all sets done",
    });
  });
  it("removes Done when all sets are ticked", () => {
    expect(state(session([exercise("a", [set("1", { completedAt: at(10) })])]))).toMatchObject({
      canComplete: false,
      setId: null,
      text: "All sets done",
    });
  });
  it("opens the Timer for incomplete values and carries nullable fields across the native JSON boundary", () => {
    const result = workoutLiveState({
      session: session([exercise("a", [set("1", { reps: 8 })])]),
      now: T0 + 60_000,
      ghostsFor: () => ({}),
      unit: "kg",
      url: "vermillion:///session/s/timer",
      t,
      options: { weightUnit: "kg", weightIncrementKg: null, soundOn: false },
    });
    expect(result.canLog).toBe(false);
    expect(workoutLivePayloadSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it("uses planned ghosts when there is no history and leaves genuinely empty cells empty", () => {
    const e = exercise("a", [
      set("1", { target: { kind: "working", weight_kg: 80, reps_min: 8, reps_max: 8 } }),
    ]);
    expect(loggingGhosts(e, 0, [], { weightUnit: "kg", weightIncrementKg: null })).toMatchObject({
      weight: 80,
      reps: 8,
    });
    expect(
      loggingGhosts(exercise("b", [set("2")]), 0, [], {
        weightUnit: "kg",
        weightIncrementKg: null,
      }),
    ).toMatchObject({ weight: null, reps: null });
  });
});
