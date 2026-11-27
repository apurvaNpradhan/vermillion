import { watchSession } from "../index";
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
import { discardSession, finishSession, startRest, startSession } from "./session-store";
import {
  ACTIVE_SESSIONS_SQL,
  EQUIPMENT_SQL,
  FINISHED_OF_WORKOUT_SQL,
  EXERCISE_HISTORY_SQL,
  SESSIONS_BETWEEN_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  SESSION_SET_COUNTS_SQL,
  parseSessionSetCounts,
  exerciseHistoriesSql,
  exerciseRecordsSql,
  finishedFingerprintSql,
  sessionsPageSql,
  readFinishedHistoryPages,
  createFinishedHistoryReader,
  parseActiveSessions,
  parseEquipment,
  parseExerciseHistories,
  parseFinishedOfWorkout,
  parseFinishedSessions,
  parseSessionDetail,
} from "./session-watch";
import { setExerciseSetting, upsertEquipment } from "./equipment-store";
import { readRecordHistory, watchHistoryOverview } from "../watch";

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

it.each(["top", "backoff", "myo"] as const)(
  "reads %s sets with effort from local storage",
  async (kind) => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle });
    const [exercise] = await addSessionExercises(s.training, id, [SQUAT]);
    const [first] = s.sets(exercise ?? "");
    const setId = String(first?.["id"]);
    await updateSet(s.training, setId, { kind, rpe: 8 });
    await tickSet(s.training, setId, { weight: 100, reps: 5, rpe: 8 });
    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    expect(detail?.exercises[0]?.sets[0]).toMatchObject({ kind, rpe: 8, weightKg: 100, reps: 5 });
  },
);

describe("finished Sessions of a Workout", () => {
  it("lists only that Workout's finished Sessions, latest first", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const day = daysAgo(2).slice(0, 10);
    const first = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishSession(s.training, first, {
      startedAt: `${day}T08:00:00Z`,
      finishedAt: `${day}T09:00:00Z`,
    });
    const second = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishSession(s.training, second, {
      startedAt: `${day}T17:00:00Z`,
      finishedAt: `${day}T18:00:00Z`,
    });
    // Simulate the timestamp format of a finished Session received from PowerSync.
    s.sqlite
      .prepare("UPDATE training_session SET finished_at = ? WHERE id = ?")
      .run(`${day} 18:00:00+00:00`, second);
    await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishedSquat(s, daysAgo(3), [100]);
    const deleted = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishSession(s.training, deleted, {
      finishedAt: `${day}T19:00:00Z`,
      startedAt: `${day}T18:30:00Z`,
    });
    await discardSession(s.training, deleted);
    const foreign = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishSession(s.training, foreign, {
      finishedAt: `${day}T20:00:00Z`,
      startedAt: `${day}T19:30:00Z`,
    });
    s.sqlite
      .prepare("UPDATE training_session SET user_id = ? WHERE id = ?")
      .run("other-user", foreign);
    const future = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    await finishSession(s.training, future, {
      finishedAt: `${day}T22:00:00Z`,
      startedAt: `${day}T21:30:00Z`,
    });
    s.sqlite.prepare("UPDATE workout SET title = ? WHERE id = ?").run("Renamed", plan.workoutId);

    const rows = parseFinishedOfWorkout(
      s.sqlite.prepare(FINISHED_OF_WORKOUT_SQL).all(plan.workoutId, `${day}T21:00:00Z`),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.workout_id === plan.workoutId)).toBe(true);
    expect(rows[0]?.title).toBe("Renamed");
    expect(rows[0]?.finished_at).toBe(`${day}T18:00:00.000Z`);
    expect(Date.parse(rows[0]?.finished_at ?? "")).toBeGreaterThan(
      Date.parse(rows[1]?.finished_at ?? ""),
    );
  });
});

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

it("reads per-set progression for a session exercise from its synced setting", async () => {
  const s = await setupSessions();
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
  const detail = () => parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
  expect(detail()?.exercises[0]?.progressionPerSet).toBe(false);
  await setExerciseSetting(s.training, SQUAT, { progression_per_set: true });
  expect(detail()?.exercises[0]?.progressionPerSet).toBe(true);
});

describe("one Session", () => {
  it("reads the exercises and sets in order with the library's muscles", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    const [squat] = s.exercises(id);
    const [warmup, work] = s.sets(String(squat?.["id"]));
    await updateSet(s.training, String(work?.["id"]), { rpe: 8 });
    await tickSet(s.training, String(work?.["id"]), { weight: 100, reps: 5 });
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
    await startSession(s.training, { workoutId: null, derivedTitle: "Still training" });
    const all = await readFinishedHistoryPages(async (sql, params) =>
      s.sqlite.prepare(sql).all(...params),
    );
    expect(all.slice(1).map((row) => row.id)).toEqual([b, empty, a]);
    expect(all).toHaveLength(4);
    expect(between[1]?.sets).toEqual([]);
    expect(between[0]?.sets).toHaveLength(2);
    // Repeated set rows carry the exercise title once, without a per-card detail query.
    expect(between[0]?.exerciseTitles).toEqual(["Squat"]);
    expect(
      parseFinishedSessions(s.sqlite.prepare(SESSIONS_BETWEEN_SQL).all(daysAgo(100), daysAgo(50))),
    ).toEqual([]);
  });
});

describe("the History reader", () => {
  const readerOf = (s: Sessions) => {
    const queries: string[] = [];
    const read = async (sql: string, params: string[]) => {
      queries.push(sql);
      return s.sqlite.prepare(sql).all(...params);
    };
    return {
      read,
      queries,
      setRows: () => queries.filter((sql) => sql.includes("ss.kind AS kind")),
    };
  };

  it("scopes cursor pages to a range", async () => {
    const s = await setupSessions();
    const old = await finishedSquat(s, daysAgo(100), [100]);
    const mid = await finishedSquat(s, daysAgo(10), [105]);
    const recent = await finishedSquat(s, daysAgo(1), [110]);
    const { read } = readerOf(s);
    const range = { from: daysAgo(20), to: daysAgo(0.5) };
    expect((await readFinishedHistoryPages(read, range)).map((row) => row.id)).toEqual([
      recent,
      mid,
    ]);
    expect((await readFinishedHistoryPages(read)).map((row) => row.id)).toEqual([recent, mid, old]);
  });

  it("reads over 4,000 imported workouts and keeps the range end exclusive", async () => {
    const s = await setupSessions();
    s.sqlite.exec(`WITH RECURSIVE batch(n) AS (
      VALUES (1) UNION ALL SELECT n + 1 FROM batch WHERE n < 4200
    )
    INSERT INTO training_session (id, user_id, title, started_at, finished_at, created_at)
    SELECT printf('import-%04d', n), 'owner', 'Imported',
      strftime('%Y-%m-%dT%H:%M:%fZ', '2024-01-01', n || ' hours'),
      strftime('%Y-%m-%dT%H:%M:%fZ', '2024-01-01', (n + 1) || ' hours'), 'now'
    FROM batch;
    INSERT INTO session_exercise (
      id, user_id, session_id, exercise_id, exercise_title, exercise_type, position, created_at
    ) SELECT 'e-' || id, 'owner', id, '${SQUAT}', 'Squat', 'weight_reps', 'a0', 'now'
      FROM training_session;
    WITH RECURSIVE sets(n) AS (VALUES (1) UNION ALL SELECT n + 1 FROM sets WHERE n < 12)
    INSERT INTO session_set (
      id, user_id, session_exercise_id, position, kind, weight_kg, reps, completed_at, created_at
    ) SELECT se.id || '-' || n, 'owner', se.id, printf('a%02d', n), 'working', 100, 5,
      s.finished_at, 'now' FROM session_exercise se JOIN training_session s ON s.id = se.session_id
      CROSS JOIN sets;
    `);
    const { read } = readerOf(s);
    const year = createFinishedHistoryReader({
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-06-24T00:00:00.000Z",
    });
    const all = createFinishedHistoryReader();
    const sessions = await all.refresh(read);
    expect(sessions).toHaveLength(4200);
    expect(sessions?.[0]?.sets).toHaveLength(12);
    expect(await year.refresh(read)).toHaveLength(4199);
    expect(await all.refresh(read)).toBeNull();
    const overview = new Promise<number>((resolve, reject) => {
      const stop = watchHistoryOverview(s.training, {
        onSessions: (rows) => {
          stop();
          resolve(rows.length);
        },
        onError: (error) => {
          stop();
          reject(error);
        },
      });
    });
    const exercise = await s.training.getAll<{ session_id: string }>(EXERCISE_HISTORY_SQL, [
      SQUAT,
      SQUAT,
    ]);
    expect(s.sqlite.isTransaction).toBe(false);
    expect(exercise[0]?.session_id).toBe("import-4200");
    expect(await overview).toBe(4200);
  }, 20_000);

  it("ignores ticks in an unfinished Session and reloads only a changed finished one", async () => {
    const s = await setupSessions();
    const a = await finishedSquat(s, daysAgo(10), [100]);
    const b = await finishedSquat(s, daysAgo(5), [105]);
    const { read, queries, setRows } = readerOf(s);
    const reader = createFinishedHistoryReader();
    expect((await reader.refresh(read))?.map((row) => row.id)).toEqual([b, a]);

    // A live set in an unfinished Session: no set rows are read, nothing is emitted.
    const live = await startSession(s.training, { workoutId: null, derivedTitle: "Live" });
    const [exercise] = await addSessionExercises(s.training, live, [SQUAT]);
    queries.length = 0;
    await tickSet(s.training, await addSet(s.training, exercise ?? ""), { weight: 60, reps: 8 });
    expect(await reader.refresh(read)).toBeNull();
    expect(queries).toHaveLength(1);

    // Editing a set of a finished Session loads that Session alone.
    const entry = String(s.exercises(a)[0]?.["id"]);
    const edited = String(s.sets(entry)[1]?.["id"]);
    await updateSet(s.training, edited, { weight_kg: 150 });
    queries.length = 0;
    const next = await reader.refresh(read);
    expect(setRows()).toHaveLength(1);
    expect(next?.find((row) => row.id === a)?.sets.some((set) => set.weight_kg === 150)).toBe(true);
    expect(next?.map((row) => row.id)).toEqual([b, a]);
    expect(await reader.refresh(read)).toBeNull();

    // Finishing the live Session adds it.
    await finishSession(s.training, live, { startedAt: daysAgo(1) });
    expect((await reader.refresh(read))?.map((row) => row.id)).toEqual([live, b, a]);
  });

  it("sees an edit that changes only an exercise title, its order or a set's kind", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle: "Mixed" });
    const [squatId, plankId] = await addSessionExercises(s.training, id, [SQUAT, PLANK]);
    const squat = squatId ?? "";
    const plank = plankId ?? "";
    await tickSet(s.training, String(s.sets(squat)[0]?.["id"]), { weight: 50, reps: 5 });
    await tickSet(s.training, String(s.sets(plank)[0]?.["id"]), { duration: 30 });
    await finishSession(s.training, id, { startedAt: daysAgo(3) });
    const { read } = readerOf(s);
    const reader = createFinishedHistoryReader();
    expect((await reader.refresh(read))?.[0]?.exerciseTitles).toEqual(["Squat", "Plank"]);

    s.sqlite
      .prepare("UPDATE session_exercise SET exercise_title = 'Back squat' WHERE id = ?")
      .run(squat);
    expect((await reader.refresh(read))?.[0]?.exerciseTitles).toEqual(["Back squat", "Plank"]);
    expect(await reader.refresh(read)).toBeNull();

    s.sqlite.prepare("UPDATE session_exercise SET position = 'a0' WHERE id = ?").run(plank);
    s.sqlite.prepare("UPDATE session_exercise SET position = 'a1' WHERE id = ?").run(squat);
    expect((await reader.refresh(read))?.[0]?.exerciseTitles).toEqual(["Plank", "Back squat"]);

    // The same sums, but the set now counts as another kind.
    s.sqlite
      .prepare("UPDATE session_set SET kind = 'warmup' WHERE session_exercise_id = ?")
      .run(squat);
    expect(await reader.refresh(read)).not.toBeNull();
  });

  it("reloads a finished session when two completed sets trade durations", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle: "Planks" });
    const [entry] = await addSessionExercises(s.training, id, [PLANK]);
    const [first, second] = s.sets(entry ?? "").map((row) => String(row["id"]));
    await tickSet(s.training, first ?? "", { duration: 30 });
    await tickSet(s.training, second ?? "", { duration: 60 });
    await finishSession(s.training, id, { startedAt: daysAgo(1) });
    const { read } = readerOf(s);
    const reader = createFinishedHistoryReader();
    expect((await reader.refresh(read))?.[0]?.sets.map((set) => set.duration_s)).toEqual([30, 60]);

    s.sqlite
      .prepare(`UPDATE session_set SET duration_s = CASE WHEN id = ? THEN 60 ELSE 30 END
      WHERE id IN (?, ?)`)
      .run(first ?? "", first ?? "", second ?? "");
    expect((await reader.refresh(read))?.[0]?.sets.map((set) => set.duration_s)).toEqual([60, 30]);
  });

  it("reads a record history with no 500-Session cap, unlike Previous", async () => {
    const s = await setupSessions();
    await finishedSquat(s, daysAgo(2000), [200]);
    const insertSession = s.sqlite.prepare(
      `INSERT INTO training_session (id, user_id, title, started_at, finished_at, created_at)
       VALUES (?, 'owner', 'Squats', ?, ?, 'now')`,
    );
    const insertExercise = s.sqlite.prepare(
      `INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title,
         exercise_type, position, created_at) VALUES (?, 'owner', ?, ?, 'Squat', 'weight_reps', 'a0', 'now')`,
    );
    const insertSet = s.sqlite.prepare(
      `INSERT INTO session_set (id, user_id, session_exercise_id, position, kind, weight_kg, reps,
         completed_at, created_at) VALUES (?, 'owner', ?, 'a0', 'working', 100, 5, ?, 'now')`,
    );
    for (let i = 0; i < 500; i += 1) {
      const at = new Date(Date.now() - (1500 - i) * DAY).toISOString();
      insertSession.run(`bulk-${i}`, at, at);
      insertExercise.run(`bulk-e-${i}`, `bulk-${i}`, SQUAT);
      insertSet.run(`bulk-s-${i}`, `bulk-e-${i}`, at);
    }

    const best = (sessions: { sets: { weight_kg?: number | null }[] }[]) =>
      Math.max(...sessions.flatMap((row) => row.sets.map((set) => set.weight_kg ?? 0)));
    const previous = parseExerciseHistories(
      s.sqlite.prepare(exerciseHistoriesSql(1)).all(SQUAT, SQUAT),
    ).get(SQUAT);
    expect(previous).toHaveLength(500);
    expect(best(previous ?? [])).toBe(100);
    const records = parseFinishedSessions(
      s.sqlite.prepare(exerciseRecordsSql()).all(JSON.stringify([SQUAT])),
    );
    expect(records).toHaveLength(501);
    expect(best(records)).toBe(200);
    expect(await readRecordHistory(s.training, SQUAT)).toHaveLength(501);
  });

  it("can seed records with only the requested exercises before the report", async () => {
    const s = await setupSessions();
    const old = await finishedSquat(s, "2025-12-31T23:59:59.999Z", [100]);
    await finishedSquat(s, "2026-01-01T00:00:00.000Z", [110]);
    const [unrelated] = await addSessionExercises(s.training, old, [PLANK]);
    const [plankSet] = s.sets(unrelated ?? "");
    await tickSet(s.training, String(plankSet?.["id"]), { duration: 30 });

    const exerciseIds = Array.from({ length: 1200 }, (_, index) => `ex-${index}`);
    const earlier = parseFinishedSessions(
      s.sqlite
        .prepare(exerciseRecordsSql(true))
        .all(JSON.stringify([...exerciseIds, SQUAT]), "2026-01-01T00:00:00.000Z"),
    );
    expect(earlier.map((row) => row.id)).toEqual([old]);
    expect(earlier[0]?.sets.map((set) => set.exercise_id)).toEqual([SQUAT, SQUAT]);
  });

  it("invalidates record bests only for changes to earlier finished history", async () => {
    const s = await setupSessions();
    const older = await finishedSquat(s, daysAgo(3), [100]);
    const current = await finishedSquat(s, daysAgo(2), [110]);
    const later = await finishedSquat(s, daysAgo(1), [120]);
    const cutoff = {
      id: current,
      startedAt: String(s.one("training_session", current)?.["started_at"]),
    };
    const params = [SQUAT, cutoff.startedAt, cutoff.startedAt, cutoff.id];
    const read = () => s.sqlite.prepare(finishedFingerprintSql(false, 1)).all(...params);
    const initial = read();
    expect(initial).toEqual([expect.objectContaining({ id: older })]);
    expect((await readRecordHistory(s.training, SQUAT, cutoff)).map((row) => row.id)).toEqual([
      older,
    ]);

    for (const id of [current, later]) {
      const entry = String(s.exercises(id)[0]?.["id"]);
      await updateSet(s.training, String(s.sets(entry)[1]?.["id"]), { weight_kg: 130 });
    }
    expect(read()).toEqual(initial);

    const entry = String(s.exercises(older)[0]?.["id"]);
    await updateSet(s.training, String(s.sets(entry)[1]?.["id"]), { weight_kg: 140 });
    expect(read()).not.toEqual(initial);
  });

  it("keeps a range reader to its range", async () => {
    const s = await setupSessions();
    await finishedSquat(s, daysAgo(100), [100]);
    const recent = await finishedSquat(s, daysAgo(2), [110]);
    const { read } = readerOf(s);
    const reader = createFinishedHistoryReader({ from: daysAgo(20), to: daysAgo(0) });
    expect((await reader.refresh(read))?.map((row) => row.id)).toEqual([recent]);
  });

  it("refreshes cached history after a Session's gym or phase changes", async () => {
    const s = await setupSessions();
    try {
      const id = await finishedSquat(s, daysAgo(3), [100]);
      const { read } = readerOf(s);
      const reader = createFinishedHistoryReader();
      await reader.refresh(read);

      s.sqlite.prepare("UPDATE training_session SET gym_id = 'gym' WHERE id = ?").run(id);
      expect((await reader.refresh(read))?.[0]?.gymId).toBe("gym");

      s.sqlite.prepare("UPDATE training_session SET phase = 'deload' WHERE id = ?").run(id);
      expect((await reader.refresh(read))?.[0]?.phase).toBe("deload");
    } finally {
      s.sqlite.close();
    }
  });
});

describe("per-Session set counts", () => {
  it("counts ticked non-warm-up sets of each finished Session in the window, without the 500 cap", async () => {
    const s = await setupSessions();
    try {
      // Each squat Session holds one warm-up (not counted) and one working set per weight.
      await finishedSquat(s, daysAgo(10), [100, 110, 120]);
      const recent = await finishedSquat(s, daysAgo(2), [100]);
      const empty = await startSession(s.training, { workoutId: null, derivedTitle: "Empty" });
      await finishSession(s.training, empty, { startedAt: daysAgo(3) });
      await startSession(s.training, { workoutId: null, derivedTitle: "Still training" });
      const counts = parseSessionSetCounts(
        s.sqlite.prepare(SESSION_SET_COUNTS_SQL).all(daysAgo(30), daysAgo(0)),
      );
      expect(counts.map((row) => row.sets)).toEqual([1, 3]);
      expect(
        parseSessionSetCounts(
          s.sqlite.prepare(SESSION_SET_COUNTS_SQL).all(daysAgo(30), daysAgo(5)),
        ),
      ).toHaveLength(1);

      const entry = String(s.exercises(recent)[0]?.["id"]);
      const set = String(s.sets(entry)[1]?.["id"]);
      for (let i = 0; i < 520; i++) {
        s.sqlite
          .prepare(`INSERT INTO training_session (id, user_id, title, started_at, finished_at, device_id, created_at)
          SELECT ?, user_id, title, started_at, finished_at, device_id, created_at FROM training_session WHERE id = ?`)
          .run(`filler-${i}`, recent);
        s.sqlite
          .prepare(`INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title, exercise_type, position, created_at)
          SELECT ?, user_id, ?, exercise_id, exercise_title, exercise_type, position, created_at FROM session_exercise WHERE id = ?`)
          .run(`entry-${i}`, `filler-${i}`, entry);
        s.sqlite
          .prepare(`INSERT INTO session_set (id, user_id, session_exercise_id, position, kind, weight_kg, reps, completed_at, created_at)
          SELECT ?, user_id, ?, position, kind, weight_kg, reps, completed_at, created_at FROM session_set WHERE id = ?`)
          .run(`set-${i}`, `entry-${i}`, set);
      }
      const many = parseSessionSetCounts(
        s.sqlite.prepare(SESSION_SET_COUNTS_SQL).all(daysAgo(30), daysAgo(0)),
      );
      expect(many).toHaveLength(522);
    } finally {
      s.sqlite.close();
    }
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
    const items = parseEquipment(s.sqlite.prepare(EQUIPMENT_SQL).all("", "1"));
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

it("pages beyond 500 Sessions and includes the oldest exercise best in Record comparisons", async () => {
  const s = await setupSessions();
  try {
    await finishedSquat(s, daysAgo(3), [200]);
    const recent = await finishedSquat(s, daysAgo(1), [100]);
    const entry = String(s.exercises(recent)[0]?.["id"]);
    const set = String(s.sets(entry)[1]?.["id"]);
    for (let i = 0; i < 501; i++) {
      s.sqlite
        .prepare(`INSERT INTO training_session (id, user_id, title, started_at, finished_at, device_id, created_at)
        SELECT ?, user_id, title, started_at, finished_at, device_id, created_at FROM training_session WHERE id = ?`)
        .run(`filler-${i}`, recent);
      s.sqlite
        .prepare(`INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title, exercise_type, position, created_at)
        SELECT ?, user_id, ?, exercise_id, exercise_title, exercise_type, position, created_at FROM session_exercise WHERE id = ?`)
        .run(`entry-${i}`, `filler-${i}`, entry);
      s.sqlite
        .prepare(`INSERT INTO session_set (id, user_id, session_exercise_id, position, kind, weight_kg, reps, completed_at, created_at)
        SELECT ?, user_id, ?, position, kind, weight_kg, reps, completed_at, created_at FROM session_set WHERE id = ?`)
        .run(`set-${i}`, `entry-${i}`, set);
    }
    const history = parseFinishedSessions(
      s.sqlite.prepare(exerciseRecordsSql()).all(JSON.stringify([SQUAT])),
    );
    expect(history).toHaveLength(503);
    expect(recordFlags(history).has(set)).toBe(false);
    let cursor = { startedAt: "9999", id: "~" };
    const ids: string[] = [];
    while (true) {
      const page = parseFinishedSessions(
        s.sqlite.prepare(sessionsPageSql()).all(cursor.startedAt, cursor.id, 50),
      );
      ids.push(...page.map((session) => session.id));
      const last = page.at(-1);
      if (!last) break;
      cursor = { startedAt: last.started_at, id: last.id };
    }
    expect(ids).toHaveLength(503);
    expect(new Set(ids).size).toBe(503);
    const all = await readFinishedHistoryPages(async (sql, params) =>
      s.sqlite.prepare(sql).all(...params),
    );
    expect(all.map((session) => session.id)).toEqual(ids);
  } finally {
    s.sqlite.close();
  }
});

it("reads auto warm-ups and the remembered bar for a session exercise, off by default", async () => {
  const s = await setupSessions();
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
  const detail = () => parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
  expect(detail()?.exercises[0]).toMatchObject({ autoWarmups: false, barId: null });
  await setExerciseSetting(s.training, SQUAT, { auto_warmups: true });
  expect(detail()?.exercises[0]?.autoWarmups).toBe(true);
});

describe("Session detail queries", () => {
  type Row = Record<string, string | number | null>;
  /** The per-column subqueries the detail query used before the single setting join. */
  const LEGACY_COLUMNS = `
    (SELECT progression_per_set FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS progression_per_set,
    (SELECT bar_id FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS bar_id,
    (SELECT auto_warmups FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS auto_warmups,
    (SELECT note FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS pinned_note,
    (SELECT unit FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS unit,
    (SELECT se2.note FROM session_exercise se2
      JOIN training_session s2 ON s2.id = se2.session_id
      WHERE se2.exercise_id = se.exercise_id AND s2.id != s.id AND s2.finished_at IS NOT NULL
        AND s2.started_at < s.started_at
      ORDER BY s2.started_at DESC, s2.id DESC LIMIT 1) AS last_note`;
  const COLUMNS = ["progression_per_set", "bar_id", "auto_warmups", "pinned_note", "unit"] as const;

  it("shows edited last notes and keeps the Session usable when a note is unreadable", async () => {
    const s = await setupSessions();
    const earlier = await finishedSquat(s, daysAgo(3), [100]);
    const active = await startSession(s.training, { workoutId: null, derivedTitle });
    await addSessionExercises(s.training, active, [SQUAT, SQUAT]);
    const notes: Array<Array<string | null>> = [];
    const stop = watchSession(s.training, active, {
      onSession: (session) =>
        notes.push(session?.exercises.map((exercise) => exercise.lastNote) ?? []),
      onError: (error) => {
        throw error;
      },
    });
    try {
      s.sqlite
        .prepare("UPDATE session_exercise SET note = ? WHERE session_id = ?")
        .run("Belt on", earlier);
      s.notifyTable("session_exercise");
      expect(notes).toEqual([
        [null, null],
        ["Belt on", "Belt on"],
      ]);

      s.sqlite
        .prepare("UPDATE session_exercise SET note = X'00' WHERE session_id = ?")
        .run(earlier);
      s.notifyTable("session_exercise");
      expect(notes.at(-1)).toEqual([null, null]);
    } finally {
      stop();
      s.sqlite.close();
    }
  });

  it("returns the same settings and last notes as the correlated subqueries did", async () => {
    const s = await setupSessions();
    const earlier = await finishedSquat(s, daysAgo(3), [100, 110]);
    const [earlierExercise] = s.exercises(earlier).map((row) => String(row["id"]));
    s.sqlite
      .prepare("UPDATE session_exercise SET note = ? WHERE id = ?")
      .run("Belt on", earlierExercise ?? "");
    await setExerciseSetting(s.training, SQUAT, {
      note: "Heels down",
      progression_per_set: true,
      auto_warmups: true,
      unit: "lb",
    });
    // The local replica can briefly hold duplicate settings, for example after offline writes.
    s.sqlite
      .prepare("INSERT INTO exercise_setting (id, user_id, exercise_id, note) VALUES (?, ?, ?, ?)")
      .run("z-duplicate", "owner", SQUAT, "Different note");
    const plan = await pushWorkout(s);
    for (const workoutId of [plan.workoutId, null]) {
      const id = await startSession(s.training, { workoutId, derivedTitle });
      if (workoutId === null) await addSessionExercises(s.training, id, [SQUAT, PLANK]);
      const legacy = s.sqlite
        .prepare(
          SESSION_DETAIL_SQL.replace(
            /es\.progression_per_set AS progression_per_set,[\s\S]*?es\.unit AS unit,/,
            `${LEGACY_COLUMNS},`,
          )
            .replace(/WITH first_setting AS \([\s\S]*?\)\n  SELECT/, "SELECT")
            .replace(/  LEFT JOIN first_setting[^\n]*\n  LEFT JOIN exercise_setting[^\n]*\n/, ""),
        )
        .all(id) as Row[];
      const current = s.sqlite.prepare(SESSION_DETAIL_SQL).all(id) as Row[];
      const notes = new Map(
        (s.sqlite.prepare(SESSION_LAST_NOTES_SQL).all(id) as Row[]).map((row) => [
          row["exercise_id"],
          row["last_note"],
        ]),
      );
      expect(current.length).toBe(legacy.length);
      expect(current.length).toBeGreaterThan(0);
      current.forEach((row, index) => {
        for (const column of COLUMNS) expect(row[column]).toBe(legacy[index]?.[column]);
        expect(notes.get(row["exercise_id"])).toBe(legacy[index]?.["last_note"]);
      });
      // And the merged parse carries the notes through.
      const detail = parseSessionDetail(current, s.sqlite.prepare(SESSION_LAST_NOTES_SQL).all(id));
      expect(detail?.exercises[0]).toMatchObject({ pinnedNote: "Heels down", lastNote: "Belt on" });
    }
  });
});
