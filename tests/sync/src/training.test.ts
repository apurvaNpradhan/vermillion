import { cycleState } from "@workspace/shared";
import {
  activateProgram,
  addExercises,
  addSlot,
  beginSession,
  claimDeviceOwner,
  createProgram,
  createWorkout,
  deleteProgram,
  deleteWorkout,
  ensureInstallId,
  finishSession,
  moveWorkoutExercise,
  powerSyncSchema,
  restoreProgram,
  restoreWorkout,
  skipSlot,
  sortByPosition,
  tickSet,
  unskipSlot,
  watchRunState,
  updateWorkoutExercise,
} from "@workspace/sync";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { type SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, database, type TestUser } from "./support/users";

// Seam 3 for training plans (ADR 0036): the real store on headless clients, the real upload
// handlers and the real `my_training` stream. Orderings are rows with fractional keys, so two
// devices reordering offline must converge without duplicates.

const newClient = useSyncSuite();

/** A device of the user, running the real schema and store, signed in and synced. */
async function device(user: TestUser): Promise<SyncClient> {
  const client = await newClient(user, {}, powerSyncSchema);
  await claimDeviceOwner(client.database, user.userId);
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

/** Waits for the catalog stream (lower priority than the plans) to deliver an exercise. */
async function hasExercise(client: SyncClient, id: string) {
  await vi.waitFor(async () => {
    const row = await client.database.getOptional("SELECT id FROM exercise WHERE id = ?", [id]);
    expect(row).not.toBeNull();
  }, within);
}

type Item = { id: string; position: string };
const localOrder = async (client: SyncClient, workoutId: string) =>
  sortByPosition(
    await client.database.getAll<Item>(
      "SELECT id, position FROM workout_exercise WHERE workout_id = ?",
      [workoutId],
    ),
  ).map((row) => row.id);

const serverOrder = async (workoutId: string) =>
  (
    await database.query<{ id: string }>(
      `SELECT id FROM workout_exercise WHERE workout_id = $1 AND deleted_at IS NULL
        ORDER BY position COLLATE "C", id`,
      [workoutId],
    )
  ).rows.map((row) => row.id);

const count = async (client: SyncClient, table: string) =>
  (await client.database.get<{ total: number }>(`SELECT count(*) AS total FROM ${table}`)).total;

describe("training plans sync", () => {
  it("round trips a plan to a second device of the same user", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const hold = await catalogExercise("duration");
    const [a, b] = [await device(user), await device(user)];
    await Promise.all([hasExercise(a, press), hasExercise(a, hold)]);

    const programId = await createProgram(a.database, {
      title: "Upper Lower",
      description: "Four days",
      planned_weeks: 8,
      sessions_per_week: null,
    });
    const workoutId = await createWorkout(a.database, { program_id: programId, title: "Upper" });
    const [first, second] = await addExercises(a.database, workoutId, [press, hold]);
    await addSlot(a.database, programId, workoutId);
    await addSlot(a.database, programId, null);
    await updateWorkoutExercise(a.database, first ?? "", {
      note: "Pause the first rep",
      sets: [{ kind: "warmup", reps_min: 5, reps_max: 5, weight_kg: 20 }],
    });
    await a.uploaded();

    const stored = await database.query<{ sets: unknown; user_id: string }>(
      "SELECT sets, user_id FROM workout_exercise WHERE id = $1",
      [first],
    );
    expect(stored.rows[0]).toMatchObject({
      user_id: user.userId,
      sets: [{ kind: "warmup", reps_min: 5, reps_max: 5, weight_kg: 20 }],
    });

    await vi.waitFor(async () => expect(await count(b, "program_slot")).toBe(2), within);
    expect(await b.database.get("SELECT * FROM program WHERE id = ?", [programId])).toMatchObject({
      title: "Upper Lower",
      planned_weeks: 8,
      sessions_per_week: null,
    });
    // Sets arrive as JSON text that SQLite's JSON functions read. The edit is a later upload, so
    // B may see the created row first.
    await vi.waitFor(async () => {
      const row = await b.database.get<{ sets: string; note: string }>(
        "SELECT sets, note FROM workout_exercise WHERE id = ?",
        [first],
      );
      expect(JSON.parse(row.sets)).toEqual([
        { kind: "warmup", reps_min: 5, reps_max: 5, weight_kg: 20 },
      ]);
      expect(row.note).toBe("Pause the first rep");
    }, within);
    expect(await localOrder(b, workoutId)).toEqual([first, second]);
    // The server wrote nothing the plan did not say: no cover, no deletion.
    expect(await b.database.get("SELECT cover_media_id FROM program")).toMatchObject({
      cover_media_id: null,
    });
  });

  it("converges when two devices reorder the same Workout offline", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);
    await hasExercise(b, press);

    const workoutId = await createWorkout(a.database);
    const ids = await addExercises(a.database, workoutId, [press, press, press, press]);
    await a.uploaded();
    await vi.waitFor(async () => expect(await localOrder(b, workoutId)).toEqual(ids), within);
    const [one, two, three, four] = ids as [string, string, string, string];

    await Promise.all([a.disconnect(), b.disconnect()]);
    // A moves the last one to the front; B moves the first to the end and inserts one at the end.
    await moveWorkoutExercise(a.database, four, one);
    await moveWorkoutExercise(b.database, one, null);
    const [fromB] = await addExercises(b.database, workoutId, [press]);
    // A also inserts one at the end: both devices pick the same key for the two new rows.
    const [fromA] = await addExercises(a.database, workoutId, [press]);
    await a.connect();
    await a.uploaded();
    await b.connect();
    await b.uploaded();

    const ids6 = [one, two, three, four, fromA ?? "", fromB ?? ""];
    await vi.waitFor(async () => {
      const server = await serverOrder(workoutId);
      expect(server.toSorted()).toEqual(ids6.toSorted());
      expect(await localOrder(a, workoutId)).toEqual(server);
      expect(await localOrder(b, workoutId)).toEqual(server);
    }, within);
    // No duplicates and no gaps on either device or the server.
    for (const client of [a, b]) {
      expect(await count(client, "workout_exercise")).toBe(6);
    }
    const server = await serverOrder(workoutId);
    expect(new Set(server).size).toBe(6);
    // A's move landed: four sits before three... and B's move: one is after the original rest.
    expect(server.indexOf(four)).toBeLessThan(server.indexOf(two));
    expect(server.indexOf(one)).toBeGreaterThan(server.indexOf(three));
    expect(
      [...a.outcomes().values(), ...b.outcomes().values()].every((o) => o.status === "applied"),
    ).toBe(true);

    // Reordering again after the collision still works from either device.
    expect(await moveWorkoutExercise(b.database, fromA ?? "", fromB ?? "")).toBe(true);
    await b.uploaded();
    await vi.waitFor(async () => {
      expect(await localOrder(a, workoutId)).toEqual(await serverOrder(workoutId));
      expect(await localOrder(a, workoutId)).toEqual(await localOrder(b, workoutId));
    }, within);
  });

  it("removes a deleted Program and its Workouts from both devices, and brings them back on undo", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);

    const programId = await createProgram(a.database, {
      title: "Doomed",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const keep = await createWorkout(a.database, { program_id: programId, title: "Day 1" });
    await addExercises(a.database, keep, [press, press]);
    await addSlot(a.database, programId, keep);
    const standalone = await createWorkout(a.database, { title: "Not in the program" });
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "workout_exercise")).toBe(2);
      expect(await count(b, "workout")).toBe(2);
    }, within);

    const deleted = await deleteProgram(a.database, programId);
    expect(deleted?.workouts).toHaveLength(1);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "program")).toBe(0);
      expect(await count(b, "workout_exercise")).toBe(0);
      expect(await count(b, "program_slot")).toBe(0);
    }, within);
    // The standalone Workout is not owned by the Program and stays on both devices.
    for (const client of [a, b]) {
      expect(await client.database.getAll("SELECT id FROM workout")).toEqual([{ id: standalone }]);
    }
    const tombstones = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM workout WHERE program_id = $1 AND deleted_at IS NOT NULL",
      [programId],
    );
    expect(tombstones.rows[0]?.total).toBe(1);

    if (!deleted) throw new Error("nothing was deleted");
    expect(await restoreProgram(a.database, deleted)).toBe(true);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "program")).toBe(1);
      expect(await count(b, "workout_exercise")).toBe(2);
      expect(await count(b, "program_slot")).toBe(1);
    }, within);
    const live = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM workout_exercise WHERE workout_id = $1 AND deleted_at IS NULL",
      [keep],
    );
    expect(live.rows[0]?.total).toBe(2);
    expect([...a.outcomes().values()].every((outcome) => outcome.status === "applied")).toBe(true);
  });

  it("keeps a deleted Workout deleted against a stale offline edit, and undo brings it back everywhere", async () => {
    const user = await createUser();
    const press = await catalogExercise("weight_reps");
    const [a, b] = [await device(user), await device(user)];
    await hasExercise(a, press);

    const workoutId = await createWorkout(a.database, { title: "Legs" });
    const [exerciseId] = await addExercises(a.database, workoutId, [press]);
    await a.uploaded();
    await vi.waitFor(async () => expect(await count(b, "workout_exercise")).toBe(1), within);

    await b.disconnect();
    const deleted = await deleteWorkout(a.database, workoutId);
    await a.uploaded();
    // B edits the exercise and the Workout offline, not knowing they are deleted.
    await updateWorkoutExercise(b.database, exerciseId ?? "", { note: "Stale edit" });
    await b.database.execute("UPDATE workout SET note = 'Stale note' WHERE id = ?", [workoutId]);
    await b.connect();
    await b.uploaded();

    const verdicts = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(verdicts.map((v) => (v.status === "rejected" ? v.code : v.status))).toEqual([
      "SYNC_ROW_DELETED",
      "SYNC_ROW_DELETED",
    ]);
    const server = await database.query<{ deleted_at: Date | null; note: string | null }>(
      "SELECT deleted_at, note FROM workout WHERE id = $1",
      [workoutId],
    );
    expect(server.rows[0]?.deleted_at).not.toBeNull();
    expect(server.rows[0]?.note).toBeNull();
    // The deleted rows leave B once its queue is empty.
    await vi.waitFor(async () => {
      expect(await count(b, "workout")).toBe(0);
      expect(await count(b, "workout_exercise")).toBe(0);
    }, within);

    if (!deleted) throw new Error("nothing was deleted");
    expect(await restoreWorkout(a.database, deleted)).toBe(true);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await count(b, "workout")).toBe(1);
      expect(await count(b, "workout_exercise")).toBe(1);
    }, within);
    // The stale note never landed; the restored row is the one from before the delete.
    expect(
      await b.database.get("SELECT note FROM workout_exercise WHERE id = ?", [exerciseId]),
    ).toMatchObject({ note: null });
    expect(a.records.flatMap((r) => (r.kind === "result" ? [r.result.status] : []))).not.toContain(
      "rejected",
    );
  });

  it("never delivers one user's plans to another and refuses writes against them", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const press = await catalogExercise("weight_reps");
    const [a, a2, b] = [await device(alice), await device(alice), await device(bob)];
    await hasExercise(a, press);

    const programId = await createProgram(a.database, {
      title: "Alice only",
      description: "secret",
      planned_weeks: null,
      sessions_per_week: null,
    });
    const workoutId = await createWorkout(a.database, { program_id: programId });
    const [exerciseId] = await addExercises(a.database, workoutId, [press]);
    await addSlot(a.database, programId, workoutId);
    await a.uploaded();
    // Alice's second device receiving it proves the stream has run past these writes.
    await vi.waitFor(async () => expect(await count(a2, "program_slot")).toBe(1), within);
    for (const table of ["program", "workout", "workout_exercise", "program_slot"]) {
      expect(await count(b, table), table).toBe(0);
    }

    // Bob tries to use Alice's rows, as a tampered client would with raw SQL: a Workout inside
    // her Program, an exercise in her Workout, her own Program id, then an edit and a delete of
    // it. All five are refused.
    const stamp = new Date().toISOString();
    await b.database.execute(
      "INSERT INTO workout (id, user_id, program_id, created_at) VALUES (?, ?, ?, ?)",
      [uuidv7(), bob.userId, programId, stamp],
    );
    await b.database.execute(
      `INSERT INTO workout_exercise (id, user_id, workout_id, exercise_id, position, sets, created_at)
       VALUES (?, ?, ?, ?, 'a0', '[]', ?)`,
      [uuidv7(), bob.userId, workoutId, press, stamp],
    );
    await b.database.execute(
      "INSERT INTO program (id, user_id, title, created_at) VALUES (?, ?, 'Hijack', ?)",
      [programId, bob.userId, stamp],
    );
    await b.database.execute("UPDATE program SET title = 'Tampered' WHERE id = ?", [programId]);
    await b.database.execute("DELETE FROM program WHERE id = ?", [programId]);
    await b.uploaded();
    const verdicts = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(verdicts.map((v) => (v.status === "rejected" ? v.code : v.status))).toEqual([
      "TRAINING_PARENT_NOT_FOUND",
      "TRAINING_PARENT_NOT_FOUND",
      "SYNC_ID_CONFLICT",
      "SYNC_ROW_NOT_FOUND",
      "SYNC_ROW_NOT_FOUND",
    ]);
    const server = await database.query<{ title: string; deleted_at: Date | null }>(
      "SELECT title, deleted_at FROM program WHERE id = $1",
      [programId],
    );
    expect(server.rows[0]).toMatchObject({ title: "Alice only", deleted_at: null });
    const note = await database.query<{ note: string | null }>(
      "SELECT note FROM workout_exercise WHERE id = $1",
      [exerciseId],
    );
    expect(note.rows[0]?.note).toBeNull();
    expect(await count(a2, "program")).toBe(1);
  });
});

it("converges two offline skips to one id, then syncs Undo and re-skip", async () => {
  const user = await createUser();
  const [a, b] = [await device(user), await device(user)];
  const program = await createProgram(a.database, {
    title: "Two devices",
    description: null,
    planned_weeks: null,
  });
  const workout = await createWorkout(a.database, { program_id: program, title: "Day" });
  const slotId = await addSlot(a.database, program, workout);
  const runId = await activateProgram(a.database, program);
  const day = { runId, slotId, cycle: 1 };
  await a.uploaded();
  await vi.waitFor(async () => {
    expect(
      await b.database.getOptional("SELECT id FROM program_run WHERE id = ?", [runId]),
    ).not.toBeNull();
    expect(
      await b.database.getOptional("SELECT id FROM program_slot WHERE id = ?", [slotId]),
    ).not.toBeNull();
  }, within);

  await Promise.all([a.database.disconnect(), b.database.disconnect()]);
  const [first, second] = await Promise.all([skipSlot(a.database, day), skipSlot(b.database, day)]);
  expect(first).not.toBeNull();
  expect(second).toBe(first);
  await a.connect();
  await a.uploaded();
  await b.connect();
  await b.uploaded();

  const skipsOf = (client: SyncClient) =>
    client.database.getAll("SELECT id FROM program_slot_skip WHERE run_id = ?", [runId]);
  let progress: Parameters<Parameters<typeof watchRunState>[1]>[0] | null = null;
  const stop = watchRunState(
    a.database,
    (value) => {
      progress = value;
    },
    () => {
      throw new Error("Failed to watch the active run");
    },
  );
  try {
    await vi.waitFor(async () => {
      expect(await skipsOf(a)).toEqual([{ id: first }]);
      expect(await skipsOf(b)).toEqual([{ id: first }]);
      expect(progress).toMatchObject({ runId, skips: [{ slotId, cycle: 1 }] });
    }, within);

    expect(await unskipSlot(b.database, day)).toBe(true);
    await b.uploaded();
    await vi.waitFor(async () => {
      expect(await skipsOf(a)).toEqual([]);
      expect(progress).toMatchObject({ runId, skips: [] });
    }, within);
    expect(await skipSlot(a.database, day)).toBe(first);
    await a.uploaded();
    await vi.waitFor(async () => expect(await skipsOf(b)).toEqual([{ id: first }]), within);
    for (const client of [a, b]) {
      expect([...client.outcomes().values()].every((outcome) => outcome.status === "applied")).toBe(
        true,
      );
    }
  } finally {
    stop();
  }
});

it("counts the chosen repeated day when an offline skip for it arrives", async () => {
  const user = await createUser();
  const [a, b] = [await device(user), await device(user)];
  await ensureInstallId(a.database);
  const exercise = await catalogExercise("weight_reps");
  await hasExercise(a, exercise);
  const program = await createProgram(a.database, {
    title: "Repeat",
    description: null,
    planned_weeks: null,
  });
  const workoutId = await createWorkout(a.database, { program_id: program, title: "Day" });
  await addExercises(a.database, workoutId, [exercise]);
  const first = await addSlot(a.database, program, workoutId);
  const second = await addSlot(a.database, program, workoutId);
  const runId = await activateProgram(a.database, program);
  const day = { runId, cycle: 1, slotId: second };
  await a.uploaded();
  await vi.waitFor(async () => {
    expect(
      await b.database.getOptional("SELECT id FROM program_run WHERE id = ?", [runId]),
    ).not.toBeNull();
    expect(
      await b.database.getOptional("SELECT id FROM program_slot WHERE id = ?", [second]),
    ).not.toBeNull();
  }, within);
  await b.database.disconnect();
  const skipped = await skipSlot(b.database, day);
  expect(skipped).not.toBeNull();

  const { id } = await beginSession(a.database, { workoutId, day }, "Chosen day");
  const set = await a.database.get<{ id: string }>(
    `SELECT s.id FROM session_set s JOIN session_exercise e ON e.id = s.session_exercise_id
     WHERE e.session_id = ? ORDER BY s.position, s.id LIMIT 1`,
    [id],
  );
  await tickSet(a.database, set.id, { weight: 100, reps: 5 });
  await finishSession(a.database, id);
  await a.uploaded();
  await b.connect();
  await b.uploaded();

  const slots = [
    { id: first, workoutId },
    { id: second, workoutId },
  ];
  let progress: ReturnType<typeof cycleState> | null = null;
  const stop = watchRunState(
    b.database,
    (value) => {
      if (value.runId === runId) progress = cycleState(slots, value.sessions, value.skips);
    },
    () => {
      throw new Error("Failed to watch the active run");
    },
  );
  try {
    await vi.waitFor(async () => {
      expect(
        await b.database.getOptional(
          "SELECT run_id, cycle, slot_id FROM training_session WHERE id = ?",
          [id],
        ),
      ).toEqual({ run_id: runId, cycle: 1, slot_id: second });
      expect(
        await b.database.getOptional("SELECT id FROM program_slot_skip WHERE id = ?", [skipped]),
      ).toEqual({ id: skipped });
      expect(progress).toMatchObject({
        cycle: 1,
        trained: new Set([second]),
        skipped: new Set(),
        next: slots[0],
      });
    }, within);
  } finally {
    stop();
  }
});
