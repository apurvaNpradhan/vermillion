import {
  ghostFor,
  previousFor,
  recordFlags,
  sessionTotals,
  tickValues,
  SET_FIELDS,
} from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { addSessionExercises, addSet, tickSet, updateSet } from "./session-content-store";
import { setupSessions, SQUAT, PLANK, pushWorkout, type Sessions } from "./session-fixtures";
import { finishSession, startRest, startSession } from "./session-store";
import {
  ACTIVE_SESSIONS_SQL,
  EQUIPMENT_SQL,
  EXERCISE_HISTORY_SQL,
  SESSIONS_BETWEEN_SQL,
  SESSION_DETAIL_SQL,
  exerciseHistoriesSql,
  parseActiveSessions,
  parseEquipment,
  parseExerciseHistories,
  parseFinishedSessions,
  parseSessionDetail,
} from "./session-watch";
import { upsertEquipment } from "./equipment-store";

const derivedTitle = "Quadriceps";
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/** A finished Session of the squat: one warm-up and then the given working weights, all ticked. */
async function finishedSquat(s: Sessions, startedAt: string, weights: number[], warmup = 40) {
  const id = await startSession(s.training, { workoutId: null, derivedTitle: "Squats" });
  const [exercise] = await addSessionExercises(s.training, id, [SQUAT]);
  const [first] = s.sets(exercise ?? "");
  await updateSet(s.training, String(first?.["id"]), { kind: "warmup" });
  await tickSet(s.training, String(first?.["id"]), { weight: warmup, reps: 10 });
  for (const weight of weights) {
    const setId = await addSet(s.training, exercise ?? "");
    await tickSet(s.training, setId, { weight, reps: 5 });
  }
  await finishSession(s.training, id, {
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
  });
  return id;
}

describe("active Sessions", () => {
  it("lists every unfinished Session, newest first, with its counts and last tick", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const older = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await new Promise((resolve) => setTimeout(resolve, 3));
    const newer = await startSession(s.training, { workoutId: null, derivedTitle: "Workout" });
    await finishedSquat(s, daysAgo(2), [100]);
    const [warmup] = s.sets(String(s.exercises(older)[0]?.["id"]));
    await tickSet(s.training, String(warmup?.["id"]), { weight: 40, reps: 10 });

    const active = parseActiveSessions(s.sqlite.prepare(ACTIVE_SESSIONS_SQL).all());
    expect(active.map((row) => row.id)).toEqual([newer, older]);
    expect(active[0]).toMatchObject({
      title: "Workout",
      titleDerived: true,
      exerciseCount: 0,
      totalSets: 0,
      tickedSets: 0,
      lastTickedAt: null,
      deviceId: s.installId,
    });
    expect(active[1]).toMatchObject({
      workoutId: plan.workoutId,
      title: "Legs",
      titleDerived: false,
      exerciseCount: 2,
      totalSets: 6,
      tickedSets: 1,
      lastTickedAt: expect.any(String),
    });
    expect(parseActiveSessions([])).toEqual([]);
  });
});

describe("one Session", () => {
  it("reads the exercises and sets in order with the library's muscles", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    const [squat] = s.exercises(id);
    const [warmup, work] = s.sets(String(squat?.["id"]));
    await tickSet(s.training, String(work?.["id"]), { weight: 100, reps: 5, rpe: 8 });
    const exerciseRow = String(s.exercises(id)[1]?.["id"]);
    await startRest(s.training, id, String(warmup?.["id"]), 60);

    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    expect(detail).toMatchObject({
      id,
      title: "Legs",
      workoutId: plan.workoutId,
      finishedAt: null,
      deviceId: s.installId,
      rest: { setId: String(warmup?.["id"]) },
    });
    expect(detail?.exercises.map((row) => row.title)).toEqual(["Squat", "Plank"]);
    expect(detail?.exercises[0]).toMatchObject({
      type: "weight_reps",
      logEffort: true,
      sourceWorkoutExerciseId: plan.squat,
      exercise: { primaryMuscle: "quadriceps", secondaryMuscles: ["glutes"], equipment: "barbell" },
    });
    expect(detail?.exercises[0]?.sets.map((row) => row.kind)).toEqual([
      "warmup",
      "working",
      "working",
    ]);
    expect(detail?.exercises[0]?.sets[1]).toMatchObject({
      weightKg: 100,
      reps: 5,
      rpe: 8,
      completedAt: expect.any(String),
      target: {
        kind: "working",
        reps_min: 5,
        reps_max: 8,
        weight_kg: 100,
        effort_min: 8,
        effort_max: 8,
      },
    });
    expect(detail?.exercises[1]?.id).toBe(exerciseRow);
    expect(detail?.exercises[1]?.sets).toHaveLength(3);
    expect(parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all("missing"))).toBeNull();
  });

  it("reads a Session with no exercises, and exercises the library lost", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle: "Workout" });
    expect(parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id))).toMatchObject({
      id,
      exercises: [],
      rest: null,
    });
    await addSessionExercises(s.training, id, [PLANK]);
    s.sqlite.prepare("DELETE FROM exercise WHERE id = ?").run(PLANK);
    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    expect(detail?.exercises[0]).toMatchObject({ title: "Plank", exercise: null });
  });
});

describe("exercise history and ranges", () => {
  it("reads several exercises' histories in one query, each as its own query would", async () => {
    const s = await setupSessions();
    await finishedSquat(s, daysAgo(20), [100]);
    await finishedSquat(s, daysAgo(3), [110]);
    const other = await startSession(s.training, { workoutId: null, derivedTitle });
    const [plank] = await addSessionExercises(s.training, other, [PLANK, SQUAT]);
    await tickSet(s.training, String(s.sets(plank ?? "")[0]?.["id"]), { duration: 30 });
    await finishSession(s.training, other);

    const one = (id: string) =>
      parseFinishedSessions(s.sqlite.prepare(EXERCISE_HISTORY_SQL).all(id, id));
    const both = parseExerciseHistories(
      s.sqlite.prepare(exerciseHistoriesSql(2)).all(SQUAT, PLANK, SQUAT, PLANK),
    );
    expect(both.get(SQUAT)).toEqual(one(SQUAT));
    expect(both.get(PLANK)).toEqual(one(PLANK));
  });

  it("lists the finished Sessions of an exercise with their ticked sets, newest first", async () => {
    const s = await setupSessions();
    const oldest = await finishedSquat(s, daysAgo(20), [100, 105]);
    const newest = await finishedSquat(s, daysAgo(3), [110]);
    // Not finished, another exercise, and an unticked set must stay out.
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    await addSessionExercises(s.training, live, [SQUAT]);
    const other = await startSession(s.training, { workoutId: null, derivedTitle });
    const [plank] = await addSessionExercises(s.training, other, [PLANK]);
    await tickSet(s.training, String(s.sets(plank ?? "")[0]?.["id"]), { duration: 30 });
    await finishSession(s.training, other);

    const history = parseFinishedSessions(s.sqlite.prepare(EXERCISE_HISTORY_SQL).all(SQUAT, SQUAT));
    expect(history.map((row) => row.id)).toEqual([newest, oldest]);
    expect(history[0]?.sets.map((set) => [set.kind, set.weight_kg])).toEqual([
      ["warmup", 40],
      ["working", 110],
    ]);
    expect(history[1]?.sets.map((set) => set.weight_kg)).toEqual([40, 100, 105]);
    expect(
      history[0]?.sets.every(
        (set) => set.exercise_id === SQUAT && set.exercise_type === "weight_reps",
      ),
    ).toBe(true);
    expect(history[0]).toMatchObject({ title: "Squats", durationS: null, workoutId: null });

    // The shared numbers read it directly: Previous, Ghosts, a Tick and Records.
    const previous = previousFor(history, "working", 0);
    expect(previous).toMatchObject({ weight_kg: 110, reps: 5 });
    expect(ghostFor("weight", previous, null)).toBe(110);
    expect(previousFor(history, "warmup", 0)).toMatchObject({ weight_kg: 40 });
    expect(
      tickValues(
        {},
        { weight: ghostFor("weight", previous, null), reps: ghostFor("reps", previous, null) },
        SET_FIELDS.weight_reps,
      ),
    ).toEqual({ ok: true, values: { weight_kg: 110, reps: 5 } });
    expect(sessionTotals(history[1]?.sets ?? [])).toEqual({ volume: 500 + 525, sets: 2, reps: 10 });
    const flags = recordFlags(history);
    expect(flags.get(history[0]?.sets[1]?.id ?? "")).toContain("heaviest_weight");
    expect(flags.size).toBeGreaterThan(0);
  });

  it("reads the finished Sessions that started in a range, with all their ticked sets", async () => {
    const s = await setupSessions();
    const a = await finishedSquat(s, daysAgo(10), [100]);
    const b = await finishedSquat(s, daysAgo(5), [105]);
    await finishedSquat(s, daysAgo(1), [110]);
    const empty = await startSession(s.training, { workoutId: null, derivedTitle: "Empty" });
    await finishSession(s.training, empty, { startedAt: daysAgo(6) });

    const between = parseFinishedSessions(
      s.sqlite.prepare(SESSIONS_BETWEEN_SQL).all(daysAgo(11), daysAgo(2)),
    );
    expect(between.map((row) => row.id)).toEqual([b, empty, a]);
    expect(between[1]?.sets).toEqual([]);
    expect(between[0]?.sets).toHaveLength(2);
    expect(
      parseFinishedSessions(s.sqlite.prepare(SESSIONS_BETWEEN_SQL).all(daysAgo(100), daysAgo(50))),
    ).toEqual([]);
  });
});

describe("gym equipment", () => {
  it("lists bars before plates, heavier first", async () => {
    const s = await setupSessions();
    const kit = [
      { kind: "plate", weight_kg: 5, unit: "kg", label: null, count: null, enabled: true },
      { kind: "bar", weight_kg: 15, unit: "kg", label: "EZ", count: null, enabled: false },
      { kind: "bar", weight_kg: 20, unit: "kg", label: null, count: null, enabled: true },
      { kind: "plate", weight_kg: 20, unit: "kg", label: null, count: 2, enabled: true },
    ] as const;
    await upsertEquipment(s.training, kit);
    const items = parseEquipment(s.sqlite.prepare(EQUIPMENT_SQL).all());
    expect(items.map((item) => [item.kind, item.weightKg])).toEqual([
      ["bar", 20],
      ["bar", 15],
      ["plate", 20],
      ["plate", 5],
    ]);
    expect(items[1]).toMatchObject({ label: "EZ", enabled: false, unit: "kg" });
    expect(items[2]).toMatchObject({ count: 2 });
  });
});
