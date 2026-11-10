import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  SYNC_SCHEMA_VERSION,
  TRAINING_LIMITS,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { bundledCatalogText } from "../exercise/operations/bundled-catalog";
import { importCatalog } from "../exercise/operations/import-catalog";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

describe("training upload handlers", () => {
  let app: TestApp;
  let weightReps: string;
  let duration: string;
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
    await importCatalog(app.services.db, bundledCatalogText());
    const pick = async (type: string) => {
      const [row] = await app.rows(
        sql`SELECT id FROM exercise WHERE user_id IS NULL AND exercise_type = ${type} LIMIT 1`,
      );
      return String(row?.id);
    };
    weightReps = await pick("weight_reps");
    duration = await pick("duration");
  });
  afterAll(async () => app.close());

  type Client = ReturnType<TestApp["client"]>;
  function installOf(client: Client, userId: string) {
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
      /** One transaction per call, like the connector sends them. */
      send: (ops: SyncOp[]): Promise<SyncUploadResult> => {
        txId += 1;
        return client.sync.upload({
          userId,
          installId,
          txId,
          schemaVersion: SYNC_SCHEMA_VERSION,
          digest: computeOpsDigest(ops),
          ops,
        });
      },
    };
  }
  async function writer(email: string) {
    const client = app.client(await createSignedInUser(app, email));
    const { userId } = await client.sync.credentials();
    return installOf(client, userId);
  }
  type Writer = Awaited<ReturnType<typeof writer>>;

  const applied: SyncUploadResult = { status: "applied" };
  const rejected = (code: SyncFailureCode): Partial<SyncUploadResult> => ({
    status: "rejected",
    code,
  });
  const op = (kind: SyncOp["op"], table: string, id: string, opData?: SyncOp["opData"]): SyncOp =>
    opData ? { op: kind, table, id, opData } : { op: kind, table, id };

  /** `restore` is the explicit marker the client's Undo sends (ADR 0019). */
  const marker = (restore: boolean): Record<string, number> => (restore ? { restore: 1 } : {});
  const putProgram = (id: string, title = "Push Pull Legs", restore = false) =>
    op("PUT", "program", id, {
      title,
      description: "Three days",
      planned_weeks: 8,
      ...marker(restore),
    });
  const putWorkout = (
    id: string,
    programId: string | null = null,
    title: string | null = null,
    restore = false,
  ) => op("PUT", "workout", id, { program_id: programId, title, note: null, ...marker(restore) });
  const sets = (value: Parameters<typeof JSON.stringify>[0]) => JSON.stringify(value);
  const working = [{ kind: "working", reps_min: 8, reps_max: 10, weight_kg: 60 }];
  const putExercise = (
    id: string,
    workoutId: string,
    exerciseId = weightReps,
    extra: Record<string, string | number | null> = {},
  ) =>
    op("PUT", "workout_exercise", id, {
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: "a0",
      rest_seconds: 120,
      note: null,
      superset_group: null,
      sets: sets(working),
      ...extra,
    });
  const putSlot = (
    id: string,
    programId: string,
    workoutId: string | null,
    position = "a0",
    restore = false,
  ) =>
    op("PUT", "program_slot", id, {
      program_id: programId,
      workout_id: workoutId,
      position,
      ...marker(restore),
    });

  const deletedAt = async (
    table: "program" | "workout" | "workout_exercise" | "program_slot",
    id: string,
  ) => {
    const [row] = await app.rows(
      sql`SELECT deleted_at FROM ${sql.identifier(table)} WHERE id = ${id}`,
    );
    return row?.deleted_at ?? null;
  };
  const stored = async (table: string, id: string) => {
    if (table !== "workout_exercise") {
      return (await app.rows(sql`SELECT * FROM ${sql.identifier(table)} WHERE id = ${id}`))[0];
    }
    // The row helper reads scalar columns only, so the jsonb sets come back as text.
    const [row] = await app.rows(
      sql`SELECT id, user_id, workout_id, exercise_id, position, rest_seconds, note, superset_group, deleted_at, sets::text AS sets_text FROM workout_exercise WHERE id = ${id}`,
    );
    if (!row) return undefined;
    const { sets_text: text, ...rest } = row;
    return { ...rest, sets: JSON.parse(String(text)) };
  };

  /** A Program with a Workout (two exercises) and two Slots, uploaded. */
  async function plan(me: Writer) {
    const [programId, workoutId, ex1, ex2, slot1, slot2] = Array.from({ length: 6 }, () =>
      uuidv7(),
    );
    const result = await me.send([
      putProgram(programId ?? ""),
      putWorkout(workoutId ?? "", programId),
      putExercise(ex1 ?? "", workoutId ?? "", weightReps, { position: "a0" }),
      putExercise(ex2 ?? "", workoutId ?? "", duration, {
        position: "a1",
        sets: sets([{ kind: "working", duration_s: 30 }]),
      }),
      putSlot(slot1 ?? "", programId ?? "", workoutId ?? "", "a0"),
      putSlot(slot2 ?? "", programId ?? "", null, "a1"),
    ]);
    expect(result).toEqual(applied);
    return {
      programId: programId ?? "",
      workoutId: workoutId ?? "",
      ex1: ex1 ?? "",
      ex2: ex2 ?? "",
      slot1: slot1 ?? "",
      slot2: slot2 ?? "",
    };
  }

  it("creates, patches dirty fields and keeps server-owned columns", async () => {
    const me = await writer("creator@example.com");
    const p = await plan(me);
    expect(await stored("program", p.programId)).toMatchObject({
      user_id: me.userId,
      title: "Push Pull Legs",
      description: "Three days",
      planned_weeks: 8,
      cover_key: null,
      deleted_at: null,
    });
    expect(await stored("workout_exercise", p.ex1)).toMatchObject({
      user_id: me.userId,
      workout_id: p.workoutId,
      rest_seconds: 120,
      sets: working,
    });
    expect(await stored("program_slot", p.slot2)).toMatchObject({ workout_id: null });

    expect(await me.send([op("PATCH", "program", p.programId, { planned_weeks: 12 })])).toEqual(
      applied,
    );
    expect(await stored("program", p.programId)).toMatchObject({
      title: "Push Pull Legs",
      description: "Three days",
      planned_weeks: 12,
    });
    expect(
      await me.send([op("PATCH", "workout", p.workoutId, { title: "Push", note: "Hard" })]),
    ).toEqual(applied);
    expect(await stored("workout", p.workoutId)).toMatchObject({ title: "Push", note: "Hard" });
    expect(
      await me.send([
        op("PATCH", "workout_exercise", p.ex1, { rest_seconds: null, position: "a2", note: "Cue" }),
      ]),
    ).toEqual(applied);
    expect(await stored("workout_exercise", p.ex1)).toMatchObject({
      rest_seconds: null,
      position: "a2",
      note: "Cue",
      sets: working,
    });
    const newSets = [{ kind: "warmup", reps_min: 5, reps_max: 5 }, ...working];
    expect(
      await me.send([op("PATCH", "workout_exercise", p.ex1, { sets: sets(newSets) })]),
    ).toEqual(applied);
    expect(await stored("workout_exercise", p.ex1)).toMatchObject({ sets: newSets });
    expect(
      await me.send([
        op("PATCH", "program_slot", p.slot2, { position: "a3", workout_id: p.workoutId }),
      ]),
    ).toEqual(applied);
    expect(await stored("program_slot", p.slot2)).toMatchObject({
      position: "a3",
      workout_id: p.workoutId,
    });
  });

  it("replaces the fields of an own live row on a repeated PUT", async () => {
    const me = await writer("replace@example.com");
    const id = uuidv7();
    await me.send([putProgram(id, "First")]);
    expect(await me.send([putProgram(id, "Second")])).toEqual(applied);
    expect(await stored("program", id)).toMatchObject({ title: "Second" });
  });

  it("refuses columns the server owns and malformed data", async () => {
    const me = await writer("strict@example.com");
    const id = uuidv7();
    const extras: Record<string, string | number | null>[] = [
      { user_id: me.userId },
      { cover_key: "x" },
      { created_at: "2020-01-01" },
      { deleted_at: null },
    ];
    for (const extra of extras) {
      expect(
        await me.send([
          op("PUT", "program", id, {
            title: "T",
            description: null,
            planned_weeks: null,
            ...extra,
          }),
        ]),
      ).toMatchObject(rejected("SYNC_INVALID_OP"));
    }
    const badPrograms: Record<string, string | number | null>[] = [
      { title: "" },
      { title: "x".repeat(101) },
      { title: "ok", planned_weeks: 53 },
      { title: "ok", planned_weeks: 0 },
      { title: "ok", description: "d".repeat(10_001) },
    ];
    for (const bad of badPrograms) {
      expect(await me.send([op("PUT", "program", id, bad)])).toMatchObject(
        rejected("SYNC_INVALID_OP"),
      );
    }
    expect(await me.send([op("PUT", "program", "not-a-uuid", { title: "T" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    // A new id must be a UUIDv7 made on the client.
    expect(
      await me.send([op("PUT", "program", "0192f0a0-0000-4000-8000-000000000001", { title: "T" })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await stored("program", id)).toBeUndefined();
  });

  it("deletes a Program with everything under it and restores exactly that", async () => {
    const me = await writer("cascade@example.com");
    const p = await plan(me);
    // A second Workout, deleted on its own first, must stay deleted when the Program comes back.
    const other = uuidv7();
    const otherEx = uuidv7();
    const otherSlot = uuidv7();
    await me.send([
      putWorkout(other, p.programId, "Pull"),
      putExercise(otherEx, other),
      putSlot(otherSlot, p.programId, other, "a2"),
    ]);
    expect(await me.send([op("DELETE", "workout", other)])).toEqual(applied);
    const earlier = await deletedAt("workout", other);
    expect(earlier).not.toBeNull();
    expect(await deletedAt("workout_exercise", otherEx)).not.toBeNull();
    expect(await deletedAt("program_slot", otherSlot)).not.toBeNull();

    expect(await me.send([op("DELETE", "program", p.programId)])).toEqual(applied);
    const at = await deletedAt("program", p.programId);
    expect(at).not.toBeNull();
    for (const [table, id] of [
      ["workout", p.workoutId],
      ["workout_exercise", p.ex1],
      ["workout_exercise", p.ex2],
      ["program_slot", p.slot1],
      ["program_slot", p.slot2],
    ] as const) {
      expect(await deletedAt(table, id), `${table} ${id}`).toEqual(at);
    }
    // The earlier delete keeps its own timestamp.
    expect(await deletedAt("workout", other)).toEqual(earlier);

    // Deleting again is a no-op, and an edit of a deleted row is refused.
    expect(await me.send([op("DELETE", "program", p.programId)])).toEqual(applied);
    expect(await me.send([op("PATCH", "program", p.programId, { title: "X" })])).toMatchObject(
      rejected("SYNC_ROW_DELETED"),
    );
    expect(await me.send([op("PATCH", "workout_exercise", p.ex1, { note: "X" })])).toMatchObject(
      rejected("SYNC_ROW_DELETED"),
    );

    // Undo: the Program is put again, then its rows.
    expect(
      await me.send([
        putProgram(p.programId, "Push Pull Legs", true),
        putWorkout(p.workoutId, p.programId, null, true),
        putExercise(p.ex1, p.workoutId, weightReps, { restore: 1 }),
      ]),
    ).toEqual(applied);
    expect(await deletedAt("program", p.programId)).toBeNull();
    for (const [table, id] of [
      ["workout", p.workoutId],
      ["workout_exercise", p.ex1],
      ["workout_exercise", p.ex2],
      ["program_slot", p.slot1],
      ["program_slot", p.slot2],
    ] as const) {
      expect(await deletedAt(table, id), `${table} ${id}`).toBeNull();
    }
    expect(await deletedAt("workout", other)).toEqual(earlier);
    expect(await deletedAt("workout_exercise", otherEx)).not.toBeNull();
    expect(await deletedAt("program_slot", otherSlot)).not.toBeNull();
  });

  it("refuses a plain PUT or PATCH of a row the writer deleted: delete wins over stale writes", async () => {
    const me = await writer("stale@example.com");
    const p = await plan(me);
    expect(await me.send([op("DELETE", "program", p.programId)])).toEqual(applied);
    const at = await deletedAt("program", p.programId);

    // A stale offline create or replace of any deleted row is refused, whatever its data.
    for (const stale of [
      putProgram(p.programId, "Stale"),
      putWorkout(p.workoutId, p.programId, "Stale"),
      putExercise(p.ex1, p.workoutId),
      putSlot(p.slot1, p.programId, p.workoutId),
    ]) {
      expect(await me.send([stale]), stale.table).toMatchObject(rejected("SYNC_ROW_DELETED"));
    }
    // So is a stale edit, and a PATCH cannot carry the restore marker or clear deleted_at.
    expect(await me.send([op("PATCH", "workout", p.workoutId, { title: "Stale" })])).toMatchObject(
      rejected("SYNC_ROW_DELETED"),
    );
    const bodies: Record<string, number | null>[] = [{ restore: 1 }, { deleted_at: null }];
    for (const body of bodies) {
      expect(await me.send([op("PATCH", "program", p.programId, body)])).toMatchObject(
        rejected("SYNC_ROW_DELETED"),
      );
    }
    expect(await deletedAt("program", p.programId)).toEqual(at);
    expect(await deletedAt("workout_exercise", p.ex1)).toEqual(at);
    expect(await stored("program", p.programId)).toMatchObject({ title: "Push Pull Legs" });

    // A restore marker on a row that does not exist (or is someone else's) is refused too.
    expect(await me.send([putProgram(uuidv7(), "Ghost", true)])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    const other = await writer("stale-other@example.com");
    expect(await other.send([putProgram(p.programId, "Mine", true)])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );

    // The explicit restore works, and a second one is an ordinary replace of a live row.
    expect(await me.send([putProgram(p.programId, "Back", true)])).toEqual(applied);
    expect(await deletedAt("program", p.programId)).toBeNull();
    expect(await deletedAt("program_slot", p.slot1)).toBeNull();
    expect(await me.send([putProgram(p.programId, "Again", true)])).toEqual(applied);
  });

  it("restores only what the delete took, and refuses a restore under a deleted parent", async () => {
    const me = await writer("restore-parent@example.com");
    const p = await plan(me);
    // The Workout is deleted on its own, then the whole Program.
    await me.send([op("DELETE", "workout", p.workoutId)]);
    await me.send([op("DELETE", "program", p.programId)]);
    // The Workout and its exercises cannot come back while the Program is deleted.
    expect(await me.send([putWorkout(p.workoutId, p.programId, null, true)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(
      await me.send([putExercise(p.ex1, p.workoutId, weightReps, { restore: 1 })]),
    ).toMatchObject(rejected("TRAINING_PARENT_NOT_FOUND"));
    expect(await me.send([putSlot(p.slot1, p.programId, p.workoutId, "a0", true)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    // Restoring the Program does not bring back the Workout deleted earlier.
    const workoutAt = await deletedAt("workout", p.workoutId);
    expect(await me.send([putProgram(p.programId, "Back", true)])).toEqual(applied);
    expect(await deletedAt("program", p.programId)).toBeNull();
    expect(await deletedAt("workout", p.workoutId)).toEqual(workoutAt);
    expect(await deletedAt("workout_exercise", p.ex1)).not.toBeNull();
    // Now the Workout can be restored explicitly, with its exercises and the Slot it filled.
    expect(await me.send([putWorkout(p.workoutId, p.programId, null, true)])).toEqual(applied);
    expect(await deletedAt("workout_exercise", p.ex1)).toBeNull();
    expect(await deletedAt("workout_exercise", p.ex2)).toBeNull();
    expect(await deletedAt("program_slot", p.slot1)).toBeNull();
  });

  it("deletes a Workout with its exercises and the Slots it fills, and restores them", async () => {
    const me = await writer("workout-delete@example.com");
    const p = await plan(me);
    expect(await me.send([op("DELETE", "workout", p.workoutId)])).toEqual(applied);
    const at = await deletedAt("workout", p.workoutId);
    expect(at).not.toBeNull();
    expect(await deletedAt("workout_exercise", p.ex1)).toEqual(at);
    expect(await deletedAt("workout_exercise", p.ex2)).toEqual(at);
    expect(await deletedAt("program_slot", p.slot1)).toEqual(at);
    // The Rest slot is not filled by the Workout.
    expect(await deletedAt("program_slot", p.slot2)).toBeNull();
    expect(await deletedAt("program", p.programId)).toBeNull();

    // New exercises cannot join a deleted Workout.
    expect(await me.send([putExercise(uuidv7(), p.workoutId)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putWorkout(p.workoutId, p.programId, null, true)])).toEqual(applied);
    expect(await deletedAt("workout", p.workoutId)).toBeNull();
    expect(await deletedAt("workout_exercise", p.ex1)).toBeNull();
    expect(await deletedAt("program_slot", p.slot1)).toBeNull();
  });

  it("deletes and restores a single exercise and a single Slot", async () => {
    const me = await writer("single-delete@example.com");
    const p = await plan(me);
    expect(
      await me.send([
        op("DELETE", "workout_exercise", p.ex2),
        op("DELETE", "program_slot", p.slot2),
      ]),
    ).toEqual(applied);
    expect(await deletedAt("workout_exercise", p.ex2)).not.toBeNull();
    expect(await deletedAt("program_slot", p.slot2)).not.toBeNull();
    expect(await deletedAt("workout", p.workoutId)).toBeNull();
    expect(
      await me.send([
        putExercise(p.ex2, p.workoutId, duration, {
          restore: 1,
          sets: sets([{ kind: "working", duration_s: 45 }]),
        }),
        putSlot(p.slot2, p.programId, null, "a1", true),
      ]),
    ).toEqual(applied);
    expect(await deletedAt("workout_exercise", p.ex2)).toBeNull();
    expect(await stored("workout_exercise", p.ex2)).toMatchObject({
      sets: [{ kind: "working", duration_s: 45 }],
    });
    expect(await deletedAt("program_slot", p.slot2)).toBeNull();
  });

  it("refuses other users' rows, and reveals nothing about them", async () => {
    const alice = await writer("alice-owner@example.com");
    const mallory = await writer("mallory@example.com");
    const p = await plan(alice);
    expect(await mallory.send([putProgram(p.programId, "Mine now")])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(await mallory.send([putWorkout(p.workoutId)])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(await mallory.send([putExercise(p.ex1, uuidv7())])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(await mallory.send([putSlot(p.slot1, uuidv7(), null)])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    for (const [table, id] of [
      ["program", p.programId],
      ["workout", p.workoutId],
      ["workout_exercise", p.ex1],
      ["program_slot", p.slot1],
    ] as const) {
      expect(
        await mallory.send([op("PATCH", table, id, { position: "a9", title: "x" })]),
        `patch ${table}`,
      ).toMatchObject(rejected("SYNC_ROW_NOT_FOUND"));
      expect(await mallory.send([op("DELETE", table, id)]), `delete ${table}`).toMatchObject(
        rejected("SYNC_ROW_NOT_FOUND"),
      );
    }
    // A missing row looks the same.
    expect(await mallory.send([op("DELETE", "program", uuidv7())])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await stored("program", p.programId)).toMatchObject({
      title: "Push Pull Legs",
      deleted_at: null,
    });
  });

  it("refuses a parent that is missing, deleted or someone else's", async () => {
    const alice = await writer("parent-alice@example.com");
    const bob = await writer("parent-bob@example.com");
    const p = await plan(alice);
    const gone = uuidv7();
    // A Workout in someone else's or a missing Program.
    expect(await bob.send([putWorkout(uuidv7(), p.programId)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(await bob.send([putWorkout(uuidv7(), gone)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    // An exercise in someone else's Workout, a missing one, or with an exercise nobody can see.
    expect(await bob.send([putExercise(uuidv7(), p.workoutId)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(await alice.send([putExercise(uuidv7(), gone)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(await alice.send([putExercise(uuidv7(), p.workoutId, gone)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    // A Slot in someone else's Program or holding someone else's Workout.
    expect(await bob.send([putSlot(uuidv7(), p.programId, null)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    const bobProgram = uuidv7();
    await bob.send([putProgram(bobProgram)]);
    expect(await bob.send([putSlot(uuidv7(), bobProgram, p.workoutId)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    // Under a deleted Program.
    await alice.send([op("DELETE", "program", p.programId)]);
    expect(await alice.send([putWorkout(uuidv7(), p.programId)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
    expect(await alice.send([putSlot(uuidv7(), p.programId, null)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
  });

  it("lets a user use a Custom exercise of theirs but not another user's", async () => {
    const alice = await writer("custom-alice@example.com");
    const bob = await writer("custom-bob@example.com");
    const custom = uuidv7();
    expect(
      await alice.send([
        op("PUT", "exercise", custom, {
          title: "Alice press",
          primary_muscle: "chest",
          secondary_muscles: "[]",
          equipment: "dumbbell",
          exercise_type: "weight_reps",
          is_full_bodyweight: 0,
          instructions: null,
        }),
      ]),
    ).toEqual(applied);
    const workoutId = uuidv7();
    expect(
      await alice.send([putWorkout(workoutId), putExercise(uuidv7(), workoutId, custom)]),
    ).toEqual(applied);
    const bobWorkout = uuidv7();
    await bob.send([putWorkout(bobWorkout)]);
    expect(await bob.send([putExercise(uuidv7(), bobWorkout, custom)])).toMatchObject(
      rejected("TRAINING_PARENT_NOT_FOUND"),
    );
  });

  it("refuses a Slot whose Workout belongs to another Program or to none", async () => {
    const me = await writer("slots@example.com");
    const p = await plan(me);
    const otherProgram = uuidv7();
    const otherWorkout = uuidv7();
    const standalone = uuidv7();
    await me.send([
      putProgram(otherProgram, "Other"),
      putWorkout(otherWorkout, otherProgram),
      putWorkout(standalone),
    ]);
    expect(await me.send([putSlot(uuidv7(), p.programId, otherWorkout)])).toMatchObject(
      rejected("TRAINING_SLOT_PROGRAM_MISMATCH"),
    );
    expect(await me.send([putSlot(uuidv7(), p.programId, standalone)])).toMatchObject(
      rejected("TRAINING_SLOT_PROGRAM_MISMATCH"),
    );
    expect(
      await me.send([op("PATCH", "program_slot", p.slot2, { workout_id: otherWorkout })]),
    ).toMatchObject(rejected("TRAINING_SLOT_PROGRAM_MISMATCH"));
    // Neither the program nor the workout of a stored Slot can be changed by a patch or a PUT.
    expect(
      await me.send([op("PATCH", "program_slot", p.slot2, { program_id: otherProgram })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([putSlot(p.slot2, otherProgram, null)])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(
      await me.send([op("PATCH", "workout", p.workoutId, { program_id: otherProgram })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([putWorkout(p.workoutId, otherProgram)])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(
      await me.send([op("PATCH", "workout_exercise", p.ex1, { workout_id: otherWorkout })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    // A Workout may fill several Slots.
    expect(await me.send([putSlot(uuidv7(), p.programId, p.workoutId, "a5")])).toEqual(applied);
  });

  it("refuses sets that do not fit the exercise's type", async () => {
    const me = await writer("sets@example.com");
    const p = await plan(me);
    const bad: [string, string][] = [
      [
        "a duration field on a weight and reps exercise",
        sets([{ kind: "working", duration_s: 30 }]),
      ],
      ["an unknown key", sets([{ kind: "working", reps_min: 5, reps_max: 5, tempo: "3010" }])],
      ["a min above the max", sets([{ kind: "working", reps_min: 9, reps_max: 5 }])],
      [
        "an off-grid effort",
        sets([{ kind: "working", reps_min: 5, reps_max: 5, effort_min: 8.3, effort_max: 8.3 }]),
      ],
      ["an unknown kind", sets([{ kind: "pyramid" }])],
      ["a negative weight", sets([{ kind: "working", weight_kg: -5 }])],
      ["21 sets", sets(Array.from({ length: 21 }, () => ({ kind: "working" })))],
      ["not an array", sets({ kind: "working" })],
      ["not JSON", "[{"],
    ];
    for (const [label, value] of bad) {
      expect(
        await me.send([op("PATCH", "workout_exercise", p.ex1, { sets: value })]),
        label,
      ).toMatchObject(rejected("TRAINING_INVALID_SETS"));
      expect(
        await me.send([putExercise(uuidv7(), p.workoutId, weightReps, { sets: value })]),
        `PUT ${label}`,
      ).toMatchObject(rejected("TRAINING_INVALID_SETS"));
    }
    expect(
      await me.send([
        op("PATCH", "workout_exercise", p.ex2, {
          sets: sets([{ kind: "working", reps_min: 5, reps_max: 5 }]),
        }),
      ]),
    ).toMatchObject(rejected("TRAINING_INVALID_SETS"));
    expect(await stored("workout_exercise", p.ex1)).toMatchObject({ sets: working });
    // Exactly 20 sets, and none, are fine.
    expect(
      await me.send([
        op("PATCH", "workout_exercise", p.ex1, {
          sets: sets(Array.from({ length: 20 }, () => ({ kind: "drop" }))),
        }),
      ]),
    ).toEqual(applied);
    expect(await me.send([op("PATCH", "workout_exercise", p.ex1, { sets: "[]" })])).toEqual(
      applied,
    );
  });

  it("checks existing sets again when the exercise is replaced", async () => {
    const me = await writer("replace-exercise@example.com");
    const p = await plan(me);
    // ex1 holds weight and reps sets: they do not fit a duration exercise.
    expect(
      await me.send([op("PATCH", "workout_exercise", p.ex1, { exercise_id: duration })]),
    ).toMatchObject(rejected("TRAINING_INVALID_SETS"));
    expect(
      await me.send([
        op("PATCH", "workout_exercise", p.ex1, {
          exercise_id: duration,
          sets: sets([{ kind: "working", duration_s: 30 }]),
        }),
      ]),
    ).toEqual(applied);
    expect(await stored("workout_exercise", p.ex1)).toMatchObject({ exercise_id: duration });
  });

  it("enforces the length and range limits as constraints, not only in zod", async () => {
    const me = await writer("checks@example.com");
    const p = await plan(me);
    expect(
      await me.send([op("PATCH", "workout_exercise", p.ex1, { rest_seconds: 601 })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await me.send([op("PATCH", "workout", p.workoutId, { note: "n".repeat(1001) })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([op("PATCH", "workout", p.workoutId, { title: "" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(
      await me.send([op("PATCH", "workout", p.workoutId, { note: "n".repeat(1000) })]),
    ).toEqual(applied);
    expect(
      await me.send([op("PATCH", "workout_exercise", p.ex1, { position: "has space" })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    await expect(
      app.rows(sql`UPDATE workout SET title = ${"x".repeat(101)} WHERE id = ${p.workoutId}`),
    ).rejects.toThrow();
  });

  it("enforces the per-container limits", async () => {
    const me = await writer("limits@example.com");
    const p = await plan(me);
    // 40 exercises per Workout (ex1 and ex2 are already there).
    const fill = Array.from({ length: TRAINING_LIMITS.exercisesPerWorkout - 2 }, (_, i) =>
      putExercise(uuidv7(), p.workoutId, weightReps, { position: `b${i}` }),
    );
    expect(await me.send(fill)).toEqual(applied);
    expect(await me.send([putExercise(uuidv7(), p.workoutId)])).toMatchObject(
      rejected("TRAINING_LIMIT_REACHED"),
    );
    // A deleted exercise frees a place, and restoring it into a full Workout is refused.
    expect(await me.send([op("DELETE", "workout_exercise", p.ex2)])).toEqual(applied);
    const extra = uuidv7();
    expect(await me.send([putExercise(extra, p.workoutId)])).toEqual(applied);
    expect(
      await me.send([putExercise(p.ex2, p.workoutId, duration, { sets: "[]", restore: 1 })]),
    ).toMatchObject(rejected("TRAINING_LIMIT_REACHED"));
    // Re-writing a live row at the limit is not "one more".
    expect(await me.send([putExercise(extra, p.workoutId, weightReps, { note: "again" })])).toEqual(
      applied,
    );

    // 28 Slots per Program (two exist).
    const slots = Array.from({ length: TRAINING_LIMITS.slotsPerProgram - 2 }, (_, i) =>
      putSlot(uuidv7(), p.programId, null, `c${i}`),
    );
    expect(await me.send(slots)).toEqual(applied);
    expect(await me.send([putSlot(uuidv7(), p.programId, null, "d0")])).toMatchObject(
      rejected("TRAINING_LIMIT_REACHED"),
    );

    // Deleting the Workout takes its Slot, so a Slot fits again; restoring would pass 28.
    expect(await me.send([op("DELETE", "workout", p.workoutId)])).toEqual(applied);
    expect(await me.send([putSlot(uuidv7(), p.programId, null, "d1")])).toEqual(applied);
    expect(await me.send([putWorkout(p.workoutId, p.programId, null, true)])).toMatchObject(
      rejected("TRAINING_LIMIT_REACHED"),
    );
  });

  it("enforces 100 live Programs and 500 live Workouts, and counts only live rows", async () => {
    const me = await writer("big-limits@example.com");
    const programs = Array.from({ length: TRAINING_LIMITS.livePrograms }, () => uuidv7());
    for (let i = 0; i < programs.length; i += 50) {
      const chunk = programs.slice(i, i + 50);
      expect(await me.send(chunk.map((id) => putProgram(id)))).toEqual(applied);
    }
    expect(await me.send([putProgram(uuidv7())])).toMatchObject(rejected("TRAINING_LIMIT_REACHED"));
    // One deleted Program makes room, and putting it back is then refused until room exists.
    const [first] = programs;
    expect(await me.send([op("DELETE", "program", first ?? "")])).toEqual(applied);
    const replacement = uuidv7();
    expect(await me.send([putProgram(replacement)])).toEqual(applied);
    expect(await me.send([putProgram(first ?? "", "Push Pull Legs", true)])).toMatchObject(
      rejected("TRAINING_LIMIT_REACHED"),
    );
    // Writing a live row again at the limit is allowed.
    expect(await me.send([putProgram(replacement, "Renamed")])).toEqual(applied);

    const hold = programs[1] ?? "";
    const workouts = Array.from({ length: TRAINING_LIMITS.liveWorkouts }, () => uuidv7());
    for (let i = 0; i < workouts.length; i += 50) {
      const chunk = workouts.slice(i, i + 50);
      expect(
        await me.send(chunk.map((id, n) => putWorkout(id, n % 2 === 0 ? null : hold))),
      ).toEqual(applied);
    }
    expect(await me.send([putWorkout(uuidv7())])).toMatchObject(rejected("TRAINING_LIMIT_REACHED"));
    // Deleting the Program that owns half of them brings the count down.
    expect(await me.send([op("DELETE", "program", hold)])).toEqual(applied);
    expect(await me.send([putWorkout(uuidv7())])).toEqual(applied);
  }, 60_000);

  it("rolls the whole transaction back when one operation is refused", async () => {
    const me = await writer("rollback@example.com");
    const program = uuidv7();
    const result = await me.send([putProgram(program), putWorkout(uuidv7(), uuidv7())]);
    expect(result).toMatchObject({
      status: "rejected",
      code: "TRAINING_PARENT_NOT_FOUND",
      failedIndex: 1,
    });
    expect(await stored("program", program)).toBeUndefined();
  });

  it("serialises one user's concurrent writes so limits hold", async () => {
    const me = await writer("race@example.com");
    const p = await plan(me);
    const fill = Array.from({ length: TRAINING_LIMITS.exercisesPerWorkout - 2 - 1 }, (_, i) =>
      putExercise(uuidv7(), p.workoutId, weightReps, { position: `b${i}` }),
    );
    await me.send(fill);
    // One place is left; two devices race for it.
    const results = await Promise.all([
      me.send([putExercise(uuidv7(), p.workoutId)]),
      me.send([putExercise(uuidv7(), p.workoutId)]),
    ]);
    expect(results.filter((r) => r.status === "applied")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const [count] = await app.rows(
      sql`SELECT count(*)::int AS total FROM workout_exercise WHERE workout_id = ${p.workoutId} AND deleted_at IS NULL`,
    );
    expect(count?.total).toBe(TRAINING_LIMITS.exercisesPerWorkout);
  });
});
