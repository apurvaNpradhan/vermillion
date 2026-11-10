import {
  ACTIVE_SESSIONS_SQL,
  createProgram,
  addSlot,
  updateSlot,
  activateProgram,
  SESSION_DETAIL_SQL,
  addSessionExercises,
  claimDeviceOwner,
  createWorkout,
  discardSession,
  ensureInstallId,
  finishSession,
  parseActiveSessions,
  parseSessionDetail,
  powerSyncSchema,
  restoreSession,
  setExerciseSetting,
  startSession,
  tickSet,
  updateSet,
  upsertEquipment,
  addExercises,
} from "@workspace/sync";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { type SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, database, type TestUser } from "./support/users";

// Seam 3 for Sessions (ADR 0037, 0038): the real store on headless clients, the real upload
// handlers and the real `my_training` stream. A Logged set is its own row, so a Tick made on
// one device cannot overwrite another set, and what the user ticked survives going offline, a
// kill and a replay.

const newClient = useSyncSuite();
const derivedTitle = "Quadriceps";

/** A device of the user, running the real schema and store, signed in and synced. */
async function device(user: TestUser, faults: Parameters<typeof newClient>[1] = {}) {
  const client = await newClient(user, faults, powerSyncSchema);
  await claimDeviceOwner(client.database, user.userId);
  await ensureInstallId(client.database);
  await client.connect();
  return client;
}

async function catalogExercise(type: string): Promise<string> {
  const { rows } = await database.query<{ id: string }>(
    "SELECT id FROM exercise WHERE user_id IS NULL AND exercise_type = $1 AND retired_at IS NULL ORDER BY id LIMIT 1",
    [type],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`the catalog has no ${type} exercise`);
  return id;
}

/** Waits for the catalog stream (lower priority than the user's own rows) to deliver an exercise. */
async function hasExercise(client: SyncClient, id: string) {
  await vi.waitFor(async () => {
    expect(
      await client.database.getOptional("SELECT id FROM exercise WHERE id = ?", [id]),
    ).not.toBeNull();
  }, within);
}

const count = async (client: SyncClient, table: string) =>
  (await client.database.get<{ total: number }>(`SELECT count(*) AS total FROM ${table}`)).total;

type ServerSet = {
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed_at: Date | null;
  deleted_at: Date | null;
};
const serverSet = async (id: string) =>
  (
    await database.query<ServerSet>(
      "SELECT weight_kg, reps, rpe, completed_at, deleted_at FROM session_set WHERE id = $1",
      [id],
    )
  ).rows[0];

/** A Session of one weight/reps exercise with three sets, started on `client` and uploaded. */
async function sessionWithSets(client: SyncClient, exerciseId: string) {
  const sessionId = await startSession(client.database, { workoutId: null, derivedTitle });
  const [sessionExerciseId] = await addSessionExercises(client.database, sessionId, [exerciseId]);
  const rows = await client.database.getAll<{ id: string }>(
    "SELECT id FROM session_set WHERE session_exercise_id = ? ORDER BY position, id",
    [sessionExerciseId],
  );
  await client.uploaded();
  return { sessionId, sessionExerciseId: sessionExerciseId ?? "", sets: rows.map((row) => row.id) };
}

const verdicts = (client: SyncClient) =>
  client.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
const codes = (client: SyncClient) =>
  verdicts(client).map((v) => (v.status === "rejected" ? v.code : v.status));

describe("sessions sync", () => {
  it("finishes a snapshot after another device changes the slot workout", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const a = await device(user),
      b = await device(user);
    await hasExercise(a, press);
    const programId = await createProgram(a.database, {
      title: "Plan",
      description: null,
      planned_weeks: null,
    });
    const workoutA = await createWorkout(a.database, { title: "A", program_id: programId });
    const workoutB = await createWorkout(a.database, { title: "B", program_id: programId });
    await addExercises(a.database, workoutA, [press]);
    const slotId = await addSlot(a.database, programId, workoutA);
    await activateProgram(a.database, programId);
    const sessionId = await startSession(a.database, { workoutId: workoutA, derivedTitle: "A" });
    const detail = parseSessionDetail(await a.database.getAll(SESSION_DETAIL_SQL, [sessionId]));
    await tickSet(a.database, detail?.exercises[0]?.sets[0]?.id ?? "", { weight: 60, reps: 8 });
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(
        await b.database.getOptional("SELECT id FROM program_slot WHERE id = ?", [slotId]),
      ).not.toBeNull();
    }, within);
    await updateSlot(b.database, slotId, workoutB);
    await b.uploaded();
    await finishSession(a.database, sessionId);
    await a.uploaded();
    const stored = await database.query(
      "SELECT workout_id, finished_at FROM training_session WHERE id = $1",
      [sessionId],
    );
    expect(stored.rows[0]).toMatchObject({ workout_id: workoutA, finished_at: expect.any(Date) });
    expect(codes(a)).not.toContain("RUN_SLOT_PROGRAM_MISMATCH");
  });
  it("delivers a Session started on one device to another, with its sets and equipment", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);

    const workoutId = await createWorkout(a.database, { title: "Chest" });
    await addExercises(a.database, workoutId, [press]);
    const sessionId = await startSession(a.database, { workoutId, derivedTitle });
    const [kit] = await upsertEquipment(a.database, [
      { kind: "bar", weight_kg: 20, unit: "kg", label: null, count: null, enabled: true },
    ]);
    await setExerciseSetting(a.database, press, { bar_id: kit ?? null, log_effort: true });
    await a.uploaded();

    await vi.waitFor(async () => expect(await count(b, "session_set")).toBe(3), within);
    await vi.waitFor(async () => expect(await count(b, "exercise_setting")).toBe(1), within);
    const detail = parseSessionDetail(await b.database.getAll(SESSION_DETAIL_SQL, [sessionId]));
    expect(detail).toMatchObject({ title: "Chest", workoutId, finishedAt: null });
    expect(detail?.exercises[0]?.sets.map((set) => set.target?.reps_min)).toEqual([8, 8, 8]);
    expect(await b.database.get("SELECT * FROM gym_equipment")).toMatchObject({
      kind: "bar",
      enabled: 1,
    });
    expect(await b.database.get("SELECT * FROM exercise_setting")).toMatchObject({
      exercise_id: press,
      bar_id: kit,
      log_effort: 1,
    });
    expect(a.outcomes().size).toBeGreaterThan(0);
    expect([...a.outcomes().values()].every((outcome) => outcome.status === "applied")).toBe(true);
  });

  it("uploads a tick made offline", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    const s = await sessionWithSets(a, press);
    await vi.waitFor(async () => expect(await count(b, "session_set")).toBe(3), within);

    await a.disconnect();
    const result = await tickSet(a.database, s.sets[0] ?? "", { weight: 60, reps: 8, rpe: 8 });
    expect(result).toMatchObject({ ok: true, wrote: true });
    // One queued write, a PATCH of that set with the values and the time only.
    const queued = (await a.database.getCrudBatch(10))?.crud ?? [];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ op: "PATCH", table: "session_set", id: s.sets[0] });
    expect(Object.keys(queued[0]?.opData ?? {}).sort()).toEqual([
      "completed_at",
      "reps",
      "rpe",
      "weight_kg",
    ]);
    expect((await serverSet(s.sets[0] ?? ""))?.completed_at).toBeNull();

    await a.connect();
    await a.uploaded();
    expect(await serverSet(s.sets[0] ?? "")).toMatchObject({ weight_kg: 60, reps: 8, rpe: 8 });
    expect((await serverSet(s.sets[0] ?? ""))?.completed_at).not.toBeNull();
    await vi.waitFor(async () => {
      expect(
        await b.database.get("SELECT * FROM session_set WHERE id = ?", [s.sets[0]]),
      ).toMatchObject({
        weight_kg: 60,
        reps: 8,
      });
    }, within);
    expect(codes(a)).not.toContain("rejected");
  });

  it("keeps the ticked sets when the app is killed offline and resumed", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const first = await device(user);
    await hasExercise(first, press);
    const s = await sessionWithSets(first, press);

    await first.disconnect();
    await tickSet(first.database, s.sets[0] ?? "", { weight: 60, reps: 8 });
    await tickSet(first.database, s.sets[1] ?? "", { weight: 62.5, reps: 7 });
    const { storage } = first;
    await first.close(true);

    // The app starts again on the same database: the Session and its ticks are there, offline.
    const resumed = await newClient(user, {}, powerSyncSchema, storage);
    const active = parseActiveSessions(await resumed.database.getAll(ACTIVE_SESSIONS_SQL));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: s.sessionId, totalSets: 3, tickedSets: 2 });
    const detail = parseSessionDetail(
      await resumed.database.getAll(SESSION_DETAIL_SQL, [s.sessionId]),
    );
    expect(
      detail?.exercises[0]?.sets.map((set) => [set.weightKg, set.reps, set.completedAt !== null]),
    ).toEqual([
      [60, 8, true],
      [62.5, 7, true],
      [null, null, false],
    ]);
    expect(await resumed.queued()).toBe(2);

    await resumed.connect();
    await resumed.uploaded();
    expect(await serverSet(s.sets[0] ?? "")).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await serverSet(s.sets[1] ?? "")).toMatchObject({ weight_kg: 62.5, reps: 7 });
    expect((await serverSet(s.sets[2] ?? ""))?.completed_at).toBeNull();
    expect(await count(resumed, "session_set")).toBe(3);
  });

  it("applies a replayed upload once", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    // The first response is lost after the server applied it: the connector sends the same
    // transaction again.
    const a = await device(user, { loseResponses: 1 });
    await hasExercise(a, press);
    const sessionId = await startSession(a.database, { workoutId: null, derivedTitle });
    await addSessionExercises(a.database, sessionId, [press]);
    await a.uploaded();
    await vi.waitFor(() => expect(a.records.some((r) => r.kind === "error")).toBe(true), within);

    const rows = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM training_session WHERE id = $1",
      [sessionId],
    );
    expect(rows.rows[0]?.total).toBe(1);
    expect(
      (await database.query("SELECT id FROM session_exercise WHERE session_id = $1", [sessionId]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await database.query("SELECT id FROM session_set WHERE user_id = $1", [user.userId])).rows,
    ).toHaveLength(3);
    expect([...a.outcomes().values()].every((outcome) => outcome.status === "applied")).toBe(true);

    // A tick, replayed after another edit of the same set, does not undo that edit.
    const [setId] = (
      await a.database.getAll<{ id: string }>("SELECT id FROM session_set ORDER BY position, id")
    ).map((row) => row.id);
    a.transport.loseResponses = 1;
    await tickSet(a.database, setId ?? "", { weight: 60, reps: 8 });
    await a.uploaded();
    await updateSet(a.database, setId ?? "", { weight_kg: 65 });
    await a.uploaded();
    expect(await serverSet(setId ?? "")).toMatchObject({ weight_kg: 65, reps: 8 });
  });

  it("never delivers one user's Sessions to another and refuses writes against them", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const press = await catalogExercise("weight_reps");
    const [a, a2, b] = [await device(alice), await device(alice), await device(bob)];
    await hasExercise(a, press);

    const s = await sessionWithSets(a, press);
    await tickSet(a.database, s.sets[0] ?? "", { weight: 60, reps: 8 });
    await upsertEquipment(a.database, [
      { kind: "plate", weight_kg: 5, unit: "kg", label: null, count: null, enabled: true },
    ]);
    await setExerciseSetting(a.database, press, { log_effort: true });
    await a.uploaded();
    await vi.waitFor(async () => expect(await count(a2, "session_set")).toBe(3), within);
    await vi.waitFor(async () => expect(await count(a2, "exercise_setting")).toBe(1), within);
    for (const table of [
      "training_session",
      "session_exercise",
      "session_set",
      "gym_equipment",
      "exercise_setting",
    ]) {
      expect(await count(b, table), table).toBe(0);
    }

    // Bob uses Alice's rows as a tampered client would with raw SQL: an exercise in her Session,
    // a set in her exercise, her Session id, then an edit and a delete of a set. All refused.
    const stamp = new Date().toISOString();
    await b.database.execute(
      `INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title, exercise_type,
         position, log_effort, created_at) VALUES (?, ?, ?, ?, 'Press', 'weight_reps', 'a5', 0, ?)`,
      [uuidv7(), bob.userId, s.sessionId, press, stamp],
    );
    await b.database.execute(
      `INSERT INTO session_set (id, user_id, session_exercise_id, position, kind, created_at)
       VALUES (?, ?, ?, 'a5', 'working', ?)`,
      [uuidv7(), bob.userId, s.sessionExerciseId, stamp],
    );
    await b.database.execute(
      `INSERT INTO training_session (id, user_id, title, title_derived, started_at, device_id, created_at)
       VALUES (?, ?, 'Hijack', 0, ?, ?, ?)`,
      [s.sessionId, bob.userId, stamp, uuidv7(), stamp],
    );
    await b.database.execute("UPDATE training_session SET title = 'Tampered' WHERE id = ?", [
      s.sessionId,
    ]);
    await b.database.execute("DELETE FROM training_session WHERE id = ?", [s.sessionId]);
    await b.uploaded();
    expect(codes(b)).toEqual([
      "SESSION_PARENT_NOT_FOUND",
      "SESSION_PARENT_NOT_FOUND",
      "SYNC_ID_CONFLICT",
      "SYNC_ROW_NOT_FOUND",
      "SYNC_ROW_NOT_FOUND",
    ]);
    const server = await database.query<{ title: string; deleted_at: Date | null }>(
      "SELECT title, deleted_at FROM training_session WHERE id = $1",
      [s.sessionId],
    );
    expect(server.rows[0]).toMatchObject({ title: "Quadriceps", deleted_at: null });
    expect(await serverSet(s.sets[0] ?? "")).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await count(a2, "training_session")).toBe(1);
  });

  it("keeps both ticks when two devices tick different sets of one Session offline", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    const s = await sessionWithSets(a, press);
    await vi.waitFor(async () => expect(await count(b, "session_set")).toBe(3), within);

    await Promise.all([a.disconnect(), b.disconnect()]);
    await tickSet(a.database, s.sets[0] ?? "", { weight: 60, reps: 8 });
    await tickSet(b.database, s.sets[1] ?? "", { weight: 62.5, reps: 7 });
    await a.connect();
    await a.uploaded();
    await b.connect();
    await b.uploaded();

    expect(await serverSet(s.sets[0] ?? "")).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await serverSet(s.sets[1] ?? "")).toMatchObject({ weight_kg: 62.5, reps: 7 });
    for (const client of [a, b]) {
      await vi.waitFor(async () => {
        const ticked = await client.database.getAll<{ id: string }>(
          "SELECT id FROM session_set WHERE completed_at IS NOT NULL ORDER BY position, id",
        );
        expect(ticked.map((row) => row.id)).toEqual([s.sets[0], s.sets[1]]);
      }, within);
    }
    expect(
      [...a.outcomes().values(), ...b.outcomes().values()].every((o) => o.status === "applied"),
    ).toBe(true);
  });

  it("ends in server order when two devices edit the same set offline", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    const s = await sessionWithSets(a, press);
    const setId = s.sets[0] ?? "";
    await vi.waitFor(async () => expect(await count(b, "session_set")).toBe(3), within);

    await Promise.all([a.disconnect(), b.disconnect()]);
    // The same column on both, and different columns that must both survive.
    await updateSet(a.database, setId, { weight_kg: 100, reps: 5 });
    await updateSet(b.database, setId, { weight_kg: 120, rpe: 9 });
    await a.connect();
    await a.uploaded();
    await b.connect();
    await b.uploaded();

    // B's write reached the server last: its weight wins, A's reps and B's effort both stay.
    expect(await serverSet(setId)).toMatchObject({ weight_kg: 120, reps: 5, rpe: 9 });
    for (const client of [a, b]) {
      await vi.waitFor(async () => {
        expect(
          await client.database.get("SELECT weight_kg, reps, rpe FROM session_set WHERE id = ?", [
            setId,
          ]),
        ).toEqual({
          weight_kg: 120,
          reps: 5,
          rpe: 9,
        });
      }, within);
    }
  });

  it("brings both Sessions when two are started offline, and none is lost", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    await hasExercise(b, press);

    await Promise.all([a.disconnect(), b.disconnect()]);
    const first = await startSession(a.database, { workoutId: null, derivedTitle });
    await addSessionExercises(a.database, first, [press]);
    const second = await startSession(b.database, { workoutId: null, derivedTitle: "Other" });
    await addSessionExercises(b.database, second, [press]);
    await a.connect();
    await a.uploaded();
    await b.connect();
    await b.uploaded();

    for (const client of [a, b]) {
      await vi.waitFor(async () => {
        const active = parseActiveSessions(await client.database.getAll(ACTIVE_SESSIONS_SQL));
        expect(active.map((row) => row.id).sort()).toEqual([first, second].sort());
      }, within);
    }
    const finished = await database.query(
      "SELECT id FROM training_session WHERE user_id = $1 AND finished_at IS NULL AND deleted_at IS NULL",
      [user.userId],
    );
    expect(finished.rows).toHaveLength(2);
    expect(
      [...a.outcomes().values(), ...b.outcomes().values()].every((o) => o.status === "applied"),
    ).toBe(true);
  });

  it("finishes, discards and restores a Session across devices", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    const s = await sessionWithSets(a, press);
    await tickSet(a.database, s.sets[0] ?? "", { weight: 60, reps: 8 });
    const result = await finishSession(a.database, s.sessionId);
    expect(result).toMatchObject({ finished: true, droppedSets: 2, droppedExercises: 0 });
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "session_set")).toBe(1);
      expect(
        await b.database.get("SELECT finished_at FROM training_session WHERE id = ?", [
          s.sessionId,
        ]),
      ).not.toMatchObject({ finished_at: null });
    }, within);
    // The two unticked sets are soft-deleted on the server.
    const dropped = await database.query(
      "SELECT id FROM session_set WHERE session_exercise_id = $1 AND deleted_at IS NOT NULL",
      [s.sessionExerciseId],
    );
    expect(dropped.rows).toHaveLength(2);

    const deleted = await discardSession(a.database, s.sessionId);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "training_session")).toBe(0);
      expect(await count(b, "session_set")).toBe(0);
    }, within);
    if (!deleted) throw new Error("nothing was discarded");
    expect(await restoreSession(a.database, deleted)).toBe(true);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "training_session")).toBe(1);
      expect(await count(b, "session_exercise")).toBe(1);
      expect(await count(b, "session_set")).toBe(1);
    }, within);
    expect(await serverSet(s.sets[0] ?? "")).toMatchObject({ weight_kg: 60, deleted_at: null });
    // The dropped sets were deleted before the discard and stay deleted.
    expect(await serverSet(s.sets[1] ?? "")).toMatchObject({ weight_kg: null });
    expect((await serverSet(s.sets[1] ?? ""))?.deleted_at).not.toBeNull();
    expect(codes(a)).not.toContain("rejected");
  });
});
