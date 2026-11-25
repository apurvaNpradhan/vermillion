import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  importContentDigest,
  SESSION_LIMITS,
  SYNC_LIMITS,
  SYNC_SCHEMA_VERSION,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bundledCatalogText } from "../exercise/operations/bundled-catalog";
import { seedCatalog } from "../exercise/operations/seed-catalog";
import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

type Value = string | number | null;

describe("session upload handlers", () => {
  let app: TestApp;
  let weightReps: string;
  let duration: string;
  let bodyweight: string;
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
    await seedCatalog(app.services.db, bundledCatalogText());
    const pick = async (type: string) => {
      const [row] = await app.rows(
        sql`SELECT id FROM exercise WHERE user_id IS NULL AND exercise_type = ${type} LIMIT 1`,
      );
      return String(row?.id);
    };
    weightReps = await pick("weight_reps");
    duration = await pick("duration");
    bodyweight = await pick("bodyweight_reps");
  });
  afterAll(async () => app.close());

  type Client = ReturnType<TestApp["client"]>;
  function installOf(client: Client, userId: string) {
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
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

  it("finishes a snapshotted workout after its program slot changes", async () => {
    const a = await writer("slot-changed@example.com");
    const program = uuidv7(),
      workoutA = uuidv7(),
      workoutB = uuidv7();
    const run = uuidv7(),
      slot = uuidv7(),
      session = uuidv7();
    expect(
      await a.send([
        op("PUT", "program", program, { title: "Plan" }),
        op("PUT", "workout", workoutA, { program_id: program, title: "A" }),
        op("PUT", "workout", workoutB, { program_id: program, title: "B" }),
        op("PUT", "program_slot", slot, {
          program_id: program,
          workout_id: workoutA,
          position: "a0",
        }),
        op("PUT", "program_run", run, { program_id: program, activated_at: minutesAgo(31) }),
        putSession(session, {
          program_id: program,
          workout_id: workoutA,
          run_id: run,
          slot_id: slot,
          cycle: 1,
        }),
      ]),
    ).toEqual(applied);
    expect(await a.send([op("PATCH", "program_slot", slot, { workout_id: workoutB })])).toEqual(
      applied,
    );
    expect(
      await a.send([
        op("PATCH", "training_session", session, { finished_at: new Date().toISOString() }),
      ]),
    ).toEqual(applied);
  });

  it("refuses foreign Runs and Slots from a different Program", async () => {
    const a = await writer("run-owner@example.com");
    const b = await writer("run-other@example.com");
    const programId = uuidv7();
    const otherProgram = uuidv7();
    const runId = uuidv7();
    const slotId = uuidv7();
    expect(
      await a.send([
        op("PUT", "program", programId, { title: "One" }),
        op("PUT", "program", otherProgram, { title: "Two" }),
        op("PUT", "program_slot", slotId, {
          program_id: otherProgram,
          workout_id: null,
          position: "a0",
        }),
        op("PUT", "program_run", runId, {
          program_id: programId,
          activated_at: new Date().toISOString(),
        }),
      ]),
    ).toEqual(applied);
    expect(
      await b.send([op("PATCH", "program_run", runId, { started_at: new Date().toISOString() })]),
    ).toMatchObject(rejected("RUN_NOT_FOUND"));
    expect(
      await b.send([putSession(uuidv7(), { run_id: runId, program_id: programId })]),
    ).toMatchObject(rejected("RUN_NOT_FOUND"));
    expect(
      await a.send([
        putSession(uuidv7(), { run_id: runId, program_id: programId, slot_id: slotId }),
      ]),
    ).toMatchObject(rejected("RUN_SLOT_PROGRAM_MISMATCH"));
  });

  const applied: SyncUploadResult = { status: "applied" };
  const rejected = (code: SyncFailureCode): Partial<SyncUploadResult> => ({
    status: "rejected",
    code,
  });
  const op = (kind: SyncOp["op"], table: string, id: string, opData?: SyncOp["opData"]): SyncOp =>
    opData ? { op: kind, table, id, opData } : { op: kind, table, id };
  const marker = (restore: boolean): Record<string, number> => (restore ? { restore: 1 } : {});

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const device = uuidv7();

  const putSession = (id: string, extra: Record<string, Value> = {}, restore = false): SyncOp =>
    op("PUT", "training_session", id, {
      workout_id: null,
      program_id: null,
      run_id: null,
      slot_id: null,
      cycle: null,
      title: "Push",
      title_derived: 0,
      note: null,
      started_at: minutesAgo(30),
      finished_at: null,
      duration_s: null,
      device_id: device,
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
      ...extra,
      ...marker(restore),
    });
  const putExercise = (
    id: string,
    sessionId: string,
    exerciseId = weightReps,
    extra: Record<string, Value> = {},
    restore = false,
  ): SyncOp =>
    op("PUT", "session_exercise", id, {
      session_id: sessionId,
      exercise_id: exerciseId,
      exercise_title: "Bench press",
      exercise_type: "weight_reps",
      source_workout_exercise_id: null,
      position: "a0",
      rest_seconds: 120,
      note: null,
      superset_group: null,
      log_effort: 0,
      ...extra,
      ...marker(restore),
    });
  const target = JSON.stringify({ kind: "working", reps_min: 8, reps_max: 10, weight_kg: 60 });
  const putSet = (
    id: string,
    exerciseRowId: string,
    extra: Record<string, Value> = {},
    restore = false,
  ): SyncOp =>
    op("PUT", "session_set", id, {
      session_exercise_id: exerciseRowId,
      position: "a0",
      kind: "working",
      weight_kg: null,
      reps: null,
      duration_s: null,
      distance_m: null,
      floors: null,
      steps: null,
      rpe: null,
      completed_at: null,
      timer_started_at: null,
      target,
      ...extra,
      ...marker(restore),
    });
  const putEquipment = (id: string, extra: Record<string, Value> = {}): SyncOp =>
    op("PUT", "gym_equipment", id, {
      kind: "bar",
      weight_kg: 20,
      unit: "kg",
      label: null,
      count: null,
      enabled: 1,
      ...extra,
    });
  const putSetting = (id: string, exerciseId: string, extra: Record<string, Value> = {}): SyncOp =>
    op("PUT", "exercise_setting", id, {
      exercise_id: exerciseId,
      bar_id: null,
      log_effort: 0,
      ...extra,
    });

  // The row helper reads scalar columns only, so a set's jsonb target comes back as text.
  const stored = async (table: string, id: string) => {
    const [row] = await app.rows(
      table === "session_set"
        ? sql`SELECT id, user_id, session_exercise_id, position, kind, weight_kg, reps, duration_s, distance_m, floors, steps, rpe, completed_at, timer_started_at, generated_warmup, deleted_at, target::text AS target FROM session_set WHERE id = ${id}`
        : sql`SELECT * FROM ${sql.identifier(table)} WHERE id = ${id}`,
    );
    return row;
  };
  const deletedAt = async (table: string, id: string) =>
    (await stored(table, id))?.deleted_at ?? null;

  /** A Session with one weight/reps exercise holding two sets, uploaded. */
  async function training(me: Writer) {
    const [sessionId, exerciseId, set1, set2] = Array.from({ length: 4 }, () => uuidv7());
    const ids = {
      sessionId: sessionId ?? "",
      exerciseId: exerciseId ?? "",
      set1: set1 ?? "",
      set2: set2 ?? "",
    };
    expect(
      await me.send([
        putSession(ids.sessionId),
        putExercise(ids.exerciseId, ids.sessionId),
        putSet(ids.set1, ids.exerciseId, { position: "a0" }),
        putSet(ids.set2, ids.exerciseId, { position: "a1" }),
      ]),
    ).toEqual(applied);
    return ids;
  }

  it.each(["top", "backoff", "myo"] as const)(
    "persists %s and its effort through sync upload",
    async (kind) => {
      const me = await writer(`session-kind-${kind}@example.com`);
      const t = await training(me);
      const setId = uuidv7();
      expect(
        await me.send([putSet(setId, t.exerciseId, { kind, position: "a2", rpe: 8 })]),
      ).toEqual(applied);
      expect(await stored("session_set", setId)).toMatchObject({ kind, rpe: 8 });
      expect(await me.send([op("PATCH", "session_set", t.set1, { kind, rpe: 9 })])).toEqual(
        applied,
      );
      expect(await stored("session_set", t.set1)).toMatchObject({ kind, rpe: 9 });
    },
  );

  it("creates, patches dirty fields and deletes each table", async () => {
    const me = await writer("session-crud@example.com");
    const t = await training(me);
    expect(await stored("training_session", t.sessionId)).toMatchObject({
      user_id: me.userId,
      title: "Push",
      title_derived: false,
      device_id: device,
      finished_at: null,
      deleted_at: null,
    });
    expect(await stored("session_exercise", t.exerciseId)).toMatchObject({
      user_id: me.userId,
      session_id: t.sessionId,
      exercise_id: weightReps,
      exercise_title: "Bench press",
      exercise_type: "weight_reps",
      rest_seconds: 120,
      log_effort: false,
    });
    expect(await stored("session_set", t.set1)).toMatchObject({
      user_id: me.userId,
      session_exercise_id: t.exerciseId,
      kind: "working",
      weight_kg: null,
      completed_at: null,
    });

    // A Tick is a dirty-field PATCH of one set: the values and the time.
    const ticked = minutesAgo(1);
    expect(
      await me.send([
        op("PATCH", "session_set", t.set1, { weight_kg: 60, reps: 8, completed_at: ticked }),
      ]),
    ).toEqual(applied);
    expect(await stored("session_set", t.set1)).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await stored("session_set", t.set2)).toMatchObject({
      weight_kg: null,
      completed_at: null,
    });

    expect(
      await me.send([
        op("PATCH", "training_session", t.sessionId, {
          title: "Pull",
          title_derived: 0,
          finished_at: minutesAgo(1),
          duration_s: 3600,
          note: "Good",
        }),
      ]),
    ).toEqual(applied);
    expect(await stored("training_session", t.sessionId)).toMatchObject({
      title: "Pull",
      duration_s: 3600,
      note: "Good",
      device_id: device,
    });
    // Rest is an absolute pair of times tied to the set that started it.
    expect(
      await me.send([
        op("PATCH", "training_session", t.sessionId, {
          rest_set_id: t.set1,
          rest_started_at: minutesAgo(1),
          rest_ends_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      ]),
    ).toEqual(applied);
    expect(
      await me.send([
        op("PATCH", "session_exercise", t.exerciseId, {
          rest_seconds: null,
          note: "Slow",
          position: "a2",
        }),
      ]),
    ).toEqual(applied);
    expect(await stored("session_exercise", t.exerciseId)).toMatchObject({
      rest_seconds: null,
      note: "Slow",
      position: "a2",
      exercise_title: "Bench press",
    });

    // The generated-warm-up mark and the ramp key sync like their sibling columns, and a patch
    // that omits them leaves them alone.
    expect(
      await me.send([
        op("PATCH", "session_set", t.set2, { generated_warmup: 1 }),
        op("PATCH", "session_exercise", t.exerciseId, { warmup_key: "100|weight_reps|kg" }),
      ]),
    ).toEqual(applied);
    expect(await me.send([op("PATCH", "session_set", t.set2, { reps: 6 })])).toEqual(applied);
    expect(await stored("session_set", t.set2)).toMatchObject({ generated_warmup: true, reps: 6 });
    expect(await stored("session_exercise", t.exerciseId)).toMatchObject({
      warmup_key: "100|weight_reps|kg",
    });
    expect(await me.send([op("PATCH", "session_set", t.set2, { generated_warmup: 0 })])).toEqual(
      applied,
    );
    expect(await stored("session_set", t.set2)).toMatchObject({ generated_warmup: false });

    const barId = uuidv7();
    const settingId = uuidv7();
    expect(
      await me.send([
        putEquipment(barId, { label: "EZ", weight_kg: 10 }),
        putEquipment(uuidv7(), { kind: "plate", weight_kg: 2.5, count: 4 }),
        putSetting(settingId, weightReps, { bar_id: barId }),
      ]),
    ).toEqual(applied);
    expect(await stored("gym_equipment", barId)).toMatchObject({
      user_id: me.userId,
      kind: "bar",
      label: "EZ",
      enabled: true,
    });
    expect(
      await me.send([
        op("PATCH", "gym_equipment", barId, { enabled: 0, count: 2 }),
        op("PATCH", "exercise_setting", settingId, {
          log_effort: 1,
          progression_per_set: 1,
          auto_warmups: 1,
        }),
      ]),
    ).toEqual(applied);
    expect(await stored("gym_equipment", barId)).toMatchObject({
      enabled: false,
      count: 2,
      label: "EZ",
    });
    expect(await stored("exercise_setting", settingId)).toMatchObject({
      log_effort: true,
      progression_per_set: true,
      auto_warmups: true,
      bar_id: barId,
      exercise_id: weightReps,
    });

    expect(await me.send([op("DELETE", "session_set", t.set2)])).toEqual(applied);
    expect(await deletedAt("session_set", t.set2)).not.toBeNull();
    expect(await me.send([op("DELETE", "gym_equipment", barId)])).toEqual(applied);
    expect(await me.send([op("DELETE", "exercise_setting", settingId)])).toEqual(applied);
    expect(await deletedAt("exercise_setting", settingId)).not.toBeNull();
    // Deleting twice is a no-op.
    expect(await me.send([op("DELETE", "session_set", t.set2)])).toEqual(applied);
  });

  it("applies only one automatic equipment kit when two uploads race", async () => {
    const client = app.client(await createSignedInUser(app, "equipment-seed-race@example.com"));
    const { userId } = await client.sync.credentials();
    const race = async (device: Writer) => {
      const seed = uuidv7();
      const plate = uuidv7();
      const result = await device.send([
        putEquipment(seed, { seed }),
        putEquipment(plate, { seed, kind: "plate", weight_kg: 5 }),
      ]);
      expect(result).toEqual(applied);
      return [await stored("gym_equipment", seed), await stored("gym_equipment", plate)];
    };
    const first = installOf(client, userId);
    const second = installOf(client, userId);
    const kits = await Promise.all([race(first), race(second)]);
    expect(kits.map((kit) => kit.filter(Boolean).length).sort()).toEqual([0, 2]);

    const manual = uuidv7();
    expect(await second.send([putEquipment(manual, { label: "Custom" })])).toEqual(applied);
    expect(await stored("gym_equipment", manual)).toMatchObject({ label: "Custom" });
  });

  it("skips a late automatic kit when the inventory already contains custom equipment", async () => {
    const me = await writer("equipment-seed-late@example.com");
    const custom = uuidv7();
    expect(await me.send([putEquipment(custom, { label: "Custom", weight_kg: 17 })])).toEqual(
      applied,
    );
    const seed = uuidv7();
    const plate = uuidv7();
    expect(
      await me.send([putEquipment(seed, { seed }), putEquipment(plate, { seed, kind: "plate" })]),
    ).toEqual(applied);
    expect(await stored("gym_equipment", seed)).toBeUndefined();
    expect(await stored("gym_equipment", plate)).toBeUndefined();
    expect(await stored("gym_equipment", custom)).toMatchObject({ label: "Custom", weight_kg: 17 });
  });

  it("stores the repeated flag of an exercise and keeps it when a later PUT omits it", async () => {
    const me = await writer("session-repeated@example.com");
    const t = await training(me);
    const repeated = uuidv7();
    expect(
      await me.send([
        putExercise(repeated, t.sessionId, weightReps, { repeated: 1, position: "a1" }),
      ]),
    ).toEqual(applied);
    expect(await stored("session_exercise", repeated)).toMatchObject({ repeated: true });
    expect(
      await me.send([putExercise(repeated, t.sessionId, weightReps, { position: "a1" })]),
    ).toEqual(applied);
    expect(await stored("session_exercise", repeated)).toMatchObject({ repeated: true });
    expect(await stored("session_exercise", t.exerciseId)).toMatchObject({ repeated: false });
  });

  it("keeps a pinned note when an update omits it, and clears it on an explicit null", async () => {
    const me = await writer("session-setting-note@example.com");
    const other = await writer("session-setting-note-other@example.com");
    const settingId = uuidv7();
    expect(
      await me.send([putSetting(settingId, weightReps, { note: "Pause at the bottom" })]),
    ).toEqual(applied);
    // A PATCH from changing the auto warm-ups leaves the note alone.
    expect(
      await me.send([op("PATCH", "exercise_setting", settingId, { auto_warmups: 1 })]),
    ).toEqual(applied);
    expect(await stored("exercise_setting", settingId)).toMatchObject({
      note: "Pause at the bottom",
      auto_warmups: true,
    });
    // An older client's PUT omits the note too.
    expect(await me.send([putSetting(settingId, weightReps, { log_effort: 1 })])).toEqual(applied);
    expect(await stored("exercise_setting", settingId)).toMatchObject({
      note: "Pause at the bottom",
      log_effort: true,
    });
    expect(
      await other.send([op("PATCH", "exercise_setting", settingId, { note: null })]),
    ).not.toEqual(applied);
    expect(await me.send([op("PATCH", "exercise_setting", settingId, { note: null })])).toEqual(
      applied,
    );
    expect(await stored("exercise_setting", settingId)).toMatchObject({ note: null });
  });

  it("stores the per-set progression and workout structure columns, defaulting for legacy uploads", async () => {
    const me = await writer("session-new-columns@example.com");
    const legacySession = uuidv7();
    const legacySetting = uuidv7();
    // A legacy client omits both columns.
    expect(
      await me.send([putSession(legacySession), putSetting(legacySetting, weightReps)]),
    ).toEqual(applied);
    expect(await stored("training_session", legacySession)).toMatchObject({
      workout_structure: null,
    });
    expect(await stored("exercise_setting", legacySetting)).toMatchObject({
      progression_per_set: false,
    });

    const sessionId = uuidv7();
    const settingId = uuidv7();
    const structure = JSON.stringify([["w1", weightReps, ["working", "working"]]]);
    expect(
      await me.send([
        putSession(sessionId, { workout_structure: structure }),
        putSetting(settingId, bodyweight, { progression_per_set: 1 }),
      ]),
    ).toEqual(applied);
    expect(await stored("training_session", sessionId)).toMatchObject({
      workout_structure: structure,
    });
    expect(await stored("exercise_setting", settingId)).toMatchObject({
      progression_per_set: true,
    });
    // The structure is a snapshot: a later PATCH from an old client leaves it alone.
    expect(
      await me.send([op("PATCH", "training_session", sessionId, { title: "Renamed" })]),
    ).toEqual(applied);
    expect(await stored("training_session", sessionId)).toMatchObject({
      title: "Renamed",
      workout_structure: structure,
    });
    expect(
      await me.send([
        putSession(uuidv7(), { workout_structure: "x".repeat(SYNC_LIMITS.maxValueBytes + 1) }),
      ]),
    ).toMatchObject(rejected("SYNC_LIMIT_EXCEEDED"));
  });

  it("stores the import batch id on a Session and refuses one that is not a UUID", async () => {
    const me = await writer("session-import-batch@example.com");
    const plain = uuidv7();
    const imported = uuidv7();
    const batch = uuidv7();
    expect(
      await me.send([putSession(plain), putSession(imported, { import_batch_id: batch })]),
    ).toEqual(applied);
    expect(await stored("training_session", plain)).toMatchObject({ import_batch_id: null });
    expect(await stored("training_session", imported)).toMatchObject({ import_batch_id: batch });
    expect(await me.send([putSession(uuidv7(), { import_batch_id: "not-a-uuid" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("stores the pause columns, defaulting for apps that do not send them", async () => {
    const me = await writer("session-pause@example.com");
    const legacy = uuidv7();
    expect(await me.send([putSession(legacy)])).toEqual(applied);
    expect(await stored("training_session", legacy)).toMatchObject({
      paused_at: null,
      paused_ms: "0",
    });

    const paused = uuidv7();
    const pausedAt = minutesAgo(5);
    expect(
      await me.send([putSession(paused, { paused_at: pausedAt, paused_ms: 120_000 })]),
    ).toEqual(applied);
    expect(await stored("training_session", paused)).toMatchObject({ paused_ms: String(120_000) });
    expect(Date.parse(String((await stored("training_session", paused))?.paused_at))).toBe(
      Date.parse(pausedAt),
    );

    // Resume is a PATCH of just the two columns; an older app's PATCH leaves the pause alone.
    expect(
      await me.send([
        op("PATCH", "training_session", paused, { paused_at: null, paused_ms: 420_000 }),
      ]),
    ).toEqual(applied);
    expect(await stored("training_session", paused)).toMatchObject({
      paused_at: null,
      paused_ms: "420000",
    });
    expect(await me.send([op("PATCH", "training_session", paused, { title: "Pull" })])).toEqual(
      applied,
    );
    expect(await stored("training_session", paused)).toMatchObject({
      title: "Pull",
      paused_ms: "420000",
    });
  });

  it("settles a pause still open when an older app finishes the Session", async () => {
    const me = await writer("session-pause-settle@example.com");
    const id = uuidv7();
    const started = minutesAgo(30);
    const pausedAt = minutesAgo(10);
    const finishedAt = minutesAgo(4);
    expect(
      await me.send([
        putSession(id, { started_at: started, paused_at: pausedAt, paused_ms: 60_000 }),
      ]),
    ).toEqual(applied);
    // The older app does not know the pause: it only sets `finished_at`.
    expect(
      await me.send([op("PATCH", "training_session", id, { finished_at: finishedAt })]),
    ).toEqual(applied);
    expect(await stored("training_session", id)).toMatchObject({
      paused_at: null,
      paused_ms: String(60_000 + (Date.parse(finishedAt) - Date.parse(pausedAt))),
    });
  });

  it("merges resumes from two installs once and preserves the total on a stale finish", async () => {
    const client = app.client(await createSignedInUser(app, "session-pause-race@example.com"));
    const { userId } = await client.sync.credentials();
    const a = installOf(client, userId);
    const b = installOf(client, userId);
    const id = uuidv7(),
      exercise = uuidv7(),
      set = uuidv7();
    const pausedAt = minutesAgo(10);
    const timer = new Date(Date.parse(pausedAt) - 1000).toISOString();
    const pausedMs = 700_000_000;
    expect(
      await a.send([
        putSession(id, { paused_at: pausedAt, paused_ms: pausedMs }),
        putExercise(exercise, id, duration, { exercise_type: "duration" }),
        putSet(set, exercise, { timer_started_at: timer, target: null }),
      ]),
    ).toEqual(applied);
    const before = { paused_at: pausedAt, paused_ms: pausedMs };
    const resume = (more: number): SyncOp => ({
      ...op("PATCH", "training_session", id, { paused_at: null, paused_ms: pausedMs + more }),
      expect: before,
    });
    expect(await a.send([resume(300_000)])).toEqual(applied);
    expect(await b.send([resume(200_000)])).toEqual(applied);
    expect(Date.parse(String((await stored("session_set", set))?.timer_started_at))).toBe(
      Date.parse(timer) + 300_000,
    );
    expect(
      await b.send([
        {
          ...op("PATCH", "training_session", id, {
            finished_at: minutesAgo(1),
            paused_at: null,
            paused_ms: pausedMs + 540_000,
          }),
          expect: before,
        },
      ]),
    ).toEqual(applied);
    expect(await stored("training_session", id)).toMatchObject({
      paused_at: null,
      paused_ms: String(pausedMs + 300_000),
    });
  });

  it("refuses a pause before the start and a paused total out of range", async () => {
    const me = await writer("session-pause-invalid@example.com");
    const invalid = rejected("SYNC_INVALID_OP");
    expect(await me.send([putSession(uuidv7(), { paused_at: minutesAgo(45) })])).toMatchObject(
      invalid,
    );
    expect(await me.send([putSession(uuidv7(), { paused_ms: -1 })])).toMatchObject(invalid);
    expect(
      await me.send([putSession(uuidv7(), { paused_ms: Number.MAX_SAFE_INTEGER + 1 })]),
    ).toMatchObject(invalid);
    expect(await me.send([putSession(uuidv7(), { paused_ms: 1.5 })])).toMatchObject(invalid);
    expect(await me.send([putSession(uuidv7(), { paused_at: "yesterday" })])).toMatchObject(
      invalid,
    );
  });

  it("accepts import fingerprints and cascades a guarded undo of an untouched workout", async () => {
    const me = await writer("session-import-undo@example.com");
    const id = uuidv7(),
      batch = uuidv7(),
      exercise = uuidv7(),
      set = uuidv7();
    const fingerprint = "a".repeat(64);
    expect(
      await me.send([
        putSession(id, {
          import_batch_id: batch,
          import_fingerprint: fingerprint,
          import_content: importContentDigest([exercise, set]),
          finished_at: minutesAgo(1),
        }),
        putExercise(exercise, id),
        putSet(set, exercise),
      ]),
    ).toEqual(applied);
    expect(await stored("training_session", id)).toMatchObject({ import_fingerprint: fingerprint });
    expect(
      await me.send([op("PATCH", "training_session", id, { import_undo: `${batch}:${uuidv7()}` })]),
    ).toEqual(applied);
    for (const { table, row } of [
      { table: "training_session", row: id },
      { table: "session_exercise", row: exercise },
      { table: "session_set", row: set },
    ]) {
      expect((await stored(table, row))?.deleted_at).toBeTruthy();
    }
  });

  it("refuses guarded undo when another write added a set, and validates import metadata", async () => {
    const me = await writer("session-import-undo-keep@example.com");
    const id = uuidv7(),
      batch = uuidv7(),
      exercise = uuidv7(),
      extraSet = uuidv7();
    expect(
      await me.send([
        putSession(uuidv7(), {
          import_batch_id: batch,
          import_fingerprint: "invalid",
          import_content: "a".repeat(64),
        }),
      ]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await me.send([
        putSession(id, {
          import_batch_id: batch,
          import_fingerprint: "a".repeat(64),
          import_content: importContentDigest([exercise]),
          finished_at: minutesAgo(1),
        }),
        putExercise(exercise, id),
      ]),
    ).toEqual(applied);
    expect(await me.send([putSet(extraSet, exercise)])).toEqual(applied);
    expect(
      await me.send([op("PATCH", "training_session", id, { import_undo: `${batch}:${uuidv7()}` })]),
    ).toMatchObject(rejected("SYNC_CONSTRAINT_VIOLATION"));
    expect(await stored("training_session", id)).toMatchObject({ deleted_at: null });
    expect(await stored("session_set", extraSet)).toMatchObject({ deleted_at: null });
  });

  it("refuses columns the server owns, malformed data and bad ids", async () => {
    const me = await writer("session-strict@example.com");
    const owned: Record<string, Value>[] = [
      { user_id: me.userId },
      { created_at: "2020-01-01" },
      { deleted_at: null },
    ];
    for (const extra of owned) {
      expect(await me.send([putSession(uuidv7(), extra)])).toMatchObject(
        rejected("SYNC_INVALID_OP"),
      );
    }
    const bad: Record<string, Value>[] = [
      { title: "" },
      { title: "x".repeat(101) },
      { note: "n".repeat(1001) },
      { duration_s: 86_401 },
      { cycle: 0 },
      { device_id: "not-a-uuid" },
      { started_at: "yesterday" },
      { finished_at: minutesAgo(60) }, // before it started
      { rest_started_at: minutesAgo(1) }, // half a Rest
    ];
    for (const extra of bad) {
      expect(await me.send([putSession(uuidv7(), extra)]), JSON.stringify(extra)).toMatchObject(
        rejected("SYNC_INVALID_OP"),
      );
    }
    expect(await me.send([putSession("not-a-uuid")])).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([putSession("0192f0a0-0000-4000-8000-000000000001")])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await me.send([putEquipment(uuidv7(), { kind: "rack" })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await me.send([putEquipment(uuidv7(), { count: -1 })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
  });

  it("validates equipment weights, pair counts and units", async () => {
    const me = await writer("plate-validation@example.com");
    const invalid: Record<string, Value>[] = [
      { kind: "plate", weight_kg: 0 },
      { kind: "plate", weight_kg: -1 },
      { count: 0 },
      { count: 1.5 },
      { unit: "oz" },
    ];
    for (const extra of invalid) {
      expect(await me.send([putEquipment(uuidv7(), extra)])).toMatchObject(
        rejected("SYNC_INVALID_OP"),
      );
    }
    expect(await me.send([putEquipment(uuidv7(), { kind: "bar", weight_kg: 0 })])).toEqual(applied);
    expect(
      await me.send([putEquipment(uuidv7(), { kind: "plate", count: 1, weight_kg: 1.25 })]),
    ).toEqual(applied);
  });

  it("accepts two unfinished Sessions of one account", async () => {
    const me = await writer("session-two-active@example.com");
    const [a, b] = [uuidv7(), uuidv7()];
    expect(await me.send([putSession(a)])).toEqual(applied);
    expect(await me.send([putSession(b, { device_id: uuidv7() })])).toEqual(applied);
    const rows = await app.rows(
      sql`SELECT id FROM training_session WHERE user_id = ${me.userId} AND finished_at IS NULL AND deleted_at IS NULL`,
    );
    expect(rows.map((row) => row.id).sort()).toEqual([a, b].sort());
  });

  it("deletes a Session with its exercises and sets, and restores exactly that", async () => {
    const me = await writer("session-cascade@example.com");
    const t = await training(me);
    const other = uuidv7();
    const otherSet = uuidv7();
    await me.send([putSet(otherSet, t.exerciseId, { position: "a2" })]);
    // One set deleted on its own first must stay deleted when the Session comes back.
    expect(await me.send([op("DELETE", "session_set", otherSet)])).toEqual(applied);
    const earlier = await deletedAt("session_set", otherSet);
    expect(
      await me.send([
        putExercise(other, t.sessionId, duration, {
          exercise_type: "duration",
          exercise_title: "Plank",
          position: "a1",
        }),
      ]),
    ).toEqual(applied);

    expect(await me.send([op("DELETE", "training_session", t.sessionId)])).toEqual(applied);
    const at = await deletedAt("training_session", t.sessionId);
    expect(at).not.toBeNull();
    for (const [table, id] of [
      ["session_exercise", t.exerciseId],
      ["session_exercise", other],
      ["session_set", t.set1],
      ["session_set", t.set2],
    ] as const) {
      expect(await deletedAt(table, id), `${table} ${id}`).toEqual(at);
    }
    expect(await deletedAt("session_set", otherSet)).toEqual(earlier);

    // A stale edit or create under a deleted Session is refused; the explicit restore works.
    expect(await me.send([op("PATCH", "session_set", t.set1, { reps: 5 })])).toMatchObject(
      rejected("SYNC_ROW_DELETED"),
    );
    expect(await me.send([putSession(t.sessionId, { title: "Stale" })])).toMatchObject(
      rejected("SYNC_ROW_DELETED"),
    );
    expect(await me.send([putSet(uuidv7(), t.exerciseId)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putSession(t.sessionId, { title: "Back" }, true)])).toEqual(applied);
    for (const [table, id] of [
      ["training_session", t.sessionId],
      ["session_exercise", t.exerciseId],
      ["session_exercise", other],
      ["session_set", t.set1],
      ["session_set", t.set2],
    ] as const) {
      expect(await deletedAt(table, id), `${table} ${id}`).toBeNull();
    }
    expect(await deletedAt("session_set", otherSet)).toEqual(earlier);
    expect(await stored("training_session", t.sessionId)).toMatchObject({ title: "Back" });
    // The client's Undo then puts the children again with the marker; they are live rows already.
    expect(
      await me.send([
        putExercise(t.exerciseId, t.sessionId, weightReps, {}, true),
        putSet(t.set1, t.exerciseId, {}, true),
      ]),
    ).toEqual(applied);
  });

  it("deletes an exercise with its sets and restores it", async () => {
    const me = await writer("session-exercise-delete@example.com");
    const t = await training(me);
    expect(await me.send([op("DELETE", "session_exercise", t.exerciseId)])).toEqual(applied);
    const at = await deletedAt("session_exercise", t.exerciseId);
    expect(await deletedAt("session_set", t.set1)).toEqual(at);
    expect(await me.send([putSet(uuidv7(), t.exerciseId)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putExercise(t.exerciseId, t.sessionId, weightReps, {}, true)])).toEqual(
      applied,
    );
    expect(await deletedAt("session_exercise", t.exerciseId)).toBeNull();
    expect(await deletedAt("session_set", t.set1)).toBeNull();
    expect(await deletedAt("session_set", t.set2)).toBeNull();
  });

  it("refuses foreign rows and parents that are missing or someone else's", async () => {
    const me = await writer("session-owner@example.com");
    const you = await writer("session-intruder@example.com");
    const t = await training(me);

    expect(await you.send([putSession(t.sessionId)])).toMatchObject(rejected("SYNC_ID_CONFLICT"));
    expect(await you.send([putExercise(t.exerciseId, t.sessionId)])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(await you.send([putSet(t.set1, t.exerciseId)])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(
      await you.send([op("PATCH", "training_session", t.sessionId, { title: "Mine" })]),
    ).toMatchObject(rejected("SYNC_ROW_NOT_FOUND"));
    expect(await you.send([op("PATCH", "session_set", t.set1, { reps: 1 })])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await you.send([op("DELETE", "training_session", t.sessionId)])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await deletedAt("training_session", t.sessionId)).toBeNull();

    // New rows under someone else's, or a missing, parent.
    expect(await you.send([putExercise(uuidv7(), t.sessionId)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await you.send([putSet(uuidv7(), t.exerciseId)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putExercise(uuidv7(), uuidv7())])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putSet(uuidv7(), uuidv7())])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );

    // An exercise that is not in the catalog or the writer's own library.
    const custom = uuidv7();
    expect(
      await me.send([
        op("PUT", "exercise", custom, {
          title: "Mine only",
          primary_muscle: "chest",
          equipment: "barbell",
          exercise_type: "weight_reps",
        }),
      ]),
    ).toEqual(applied);
    expect(
      await you.send([putSession(uuidv7()), putExercise(uuidv7(), uuidv7(), custom)]),
    ).toMatchObject(rejected("SESSION_PARENT_NOT_FOUND"));
    const yours = uuidv7();
    expect(await you.send([putSession(yours), putExercise(uuidv7(), yours, custom)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putExercise(uuidv7(), t.sessionId, uuidv7())])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putExercise(uuidv7(), t.sessionId, custom)])).toEqual(applied);
    expect(
      await me.send([op("PATCH", "session_exercise", t.exerciseId, { exercise_id: uuidv7() })]),
    ).toMatchObject(rejected("SESSION_PARENT_NOT_FOUND"));

    // Equipment and settings are per user: a setting may only remember the writer's own bar.
    const bar = uuidv7();
    await me.send([putEquipment(bar)]);
    expect(await you.send([putEquipment(bar)])).toMatchObject(rejected("SYNC_ID_CONFLICT"));
    expect(await you.send([putSetting(uuidv7(), weightReps, { bar_id: bar })])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    const plate = uuidv7();
    await me.send([putEquipment(plate, { kind: "plate", weight_kg: 5 })]);
    expect(await me.send([putSetting(uuidv7(), weightReps, { bar_id: plate })])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
    expect(await me.send([putSetting(uuidv7(), custom + "x")])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(await you.send([putSetting(uuidv7(), custom)])).toMatchObject(
      rejected("SESSION_PARENT_NOT_FOUND"),
    );
  });

  it("refuses set fields the snapshot type does not record, and ticked sets without values", async () => {
    const me = await writer("session-types@example.com");
    const t = await training(me);
    const timed = uuidv7();
    const plank = uuidv7();
    expect(
      await me.send([
        putExercise(plank, t.sessionId, duration, {
          exercise_type: "duration",
          exercise_title: "Plank",
          position: "a1",
        }),
      ]),
    ).toEqual(applied);
    const ticked = minutesAgo(1);
    const invalidForType = rejected("SESSION_SET_INVALID_FOR_TYPE");

    // A duration exercise records only duration.
    const unrecorded: Record<string, Value>[] = [
      { weight_kg: 20 },
      { reps: 5 },
      { rpe: 8 },
      { distance_m: 10 },
    ];
    for (const extra of unrecorded) {
      expect(
        await me.send([putSet(timed, plank, { target: null, ...extra })]),
        JSON.stringify(extra),
      ).toMatchObject(invalidForType);
    }
    expect(
      await me.send([
        putSet(timed, plank, {
          target: JSON.stringify({ kind: "working", reps_min: 5, reps_max: 5 }),
        }),
      ]),
    ).toMatchObject(invalidForType);
    expect(await me.send([putSet(timed, plank, { target: null, duration_s: 45 })])).toEqual(
      applied,
    );
    expect(await me.send([op("PATCH", "session_set", timed, { reps: 5 })])).toMatchObject(
      invalidForType,
    );
    expect(await me.send([op("PATCH", "session_set", timed, { weight_kg: 5 })])).toMatchObject(
      invalidForType,
    );

    // A weight and reps exercise records both and effort, not duration.
    expect(await me.send([op("PATCH", "session_set", t.set1, { duration_s: 30 })])).toMatchObject(
      invalidForType,
    );
    expect(await me.send([op("PATCH", "session_set", t.set1, { rpe: 7.5 })])).toEqual(applied);
    // A ticked set holds a value for each field it records.
    expect(
      await me.send([op("PATCH", "session_set", t.set2, { completed_at: ticked })]),
    ).toMatchObject(invalidForType);
    expect(
      await me.send([op("PATCH", "session_set", t.set2, { completed_at: ticked, weight_kg: 60 })]),
    ).toMatchObject(invalidForType);
    expect(
      await me.send([
        op("PATCH", "session_set", t.set2, { completed_at: ticked, weight_kg: 60, reps: 0 }),
      ]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await me.send([
        op("PATCH", "session_set", t.set2, { completed_at: ticked, weight_kg: 0, reps: 8 }),
      ]),
    ).toEqual(applied);
    expect(await stored("session_set", t.set2)).toMatchObject({ weight_kg: 0, reps: 8 });

    // Malformed values, targets and kinds are invalid data.
    const malformed: Record<string, Value>[] = [
      { kind: "rest" },
      { rpe: 5 },
      { weight_kg: -1 },
      { weight_kg: 1001 },
      { target: "{" },
      { position: "has space" },
      { completed_at: "now" },
    ];
    for (const extra of malformed) {
      expect(
        await me.send([op("PATCH", "session_set", t.set1, extra)]),
        JSON.stringify(extra),
      ).toMatchObject(rejected("SYNC_INVALID_OP"));
    }
    // A session_exercise_id cannot move, and the session of an exercise cannot either.
    expect(
      await me.send([op("PATCH", "session_set", t.set1, { session_exercise_id: plank })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await me.send([op("PATCH", "session_exercise", t.exerciseId, { session_id: uuidv7() })]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await stored("session_set", t.set1)).toMatchObject({ rpe: 7.5, duration_s: null });
  });

  it("keeps one set's Tick from touching another, and merges columns of one set", async () => {
    const me = await writer("session-merge@example.com");
    const t = await training(me);
    const ticked = minutesAgo(1);
    // Two devices tick different sets, in either order.
    await me.send([
      op("PATCH", "session_set", t.set2, { weight_kg: 62.5, reps: 7, completed_at: ticked }),
    ]);
    await me.send([
      op("PATCH", "session_set", t.set1, { weight_kg: 60, reps: 8, completed_at: ticked }),
    ]);
    expect(await stored("session_set", t.set1)).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await stored("session_set", t.set2)).toMatchObject({ weight_kg: 62.5, reps: 7 });
    // The same set edited in different columns keeps both; the same column is last-write-wins.
    await me.send([op("PATCH", "session_set", t.set1, { rpe: 8 })]);
    await me.send([op("PATCH", "session_set", t.set1, { weight_kg: 65 })]);
    await me.send([op("PATCH", "session_set", t.set1, { weight_kg: 67.5 })]);
    expect(await stored("session_set", t.set1)).toMatchObject({ weight_kg: 67.5, reps: 8, rpe: 8 });
    // Unticking keeps the values.
    expect(await me.send([op("PATCH", "session_set", t.set1, { completed_at: null })])).toEqual(
      applied,
    );
    expect(await stored("session_set", t.set1)).toMatchObject({
      completed_at: null,
      weight_kg: 67.5,
    });
  });

  it("refuses a queued swap that would erase or re-attribute a set another device completed", async () => {
    const client = app.client(await createSignedInUser(app, "session-swap-race@example.com"));
    const { userId } = await client.sync.credentials();
    const me = installOf(client, userId);
    const otherDevice = installOf(client, userId);
    const [replacement] = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id IS NULL AND exercise_type = 'weight_reps'
        AND id <> ${weightReps} LIMIT 1`,
    );
    const replacementId = String(replacement?.id);
    const t = await training(me);
    const ticked = minutesAgo(1);
    // Device B ticks the set first; device A, offline, queued a split deleting it as unticked.
    expect(
      await otherDevice.send([
        op("PATCH", "session_set", t.set2, { weight_kg: 62.5, reps: 7, completed_at: ticked }),
      ]),
    ).toEqual(applied);
    const newExercise = uuidv7();
    const staleSplit = await me.send([
      putExercise(newExercise, t.sessionId, replacementId, { position: "a1" }),
      { op: "DELETE", table: "session_set", id: t.set2, expect: { completed_at: null } },
      putSet(uuidv7(), newExercise, { position: "a0" }),
    ]);
    expect(staleSplit).toMatchObject(rejected("SYNC_CONSTRAINT_VIOLATION"));
    // The whole transaction rolled back: the set survives and the new exercise never appeared.
    expect(await deletedAt("session_set", t.set2)).toBeNull();
    expect(await stored("session_set", t.set2)).toMatchObject({ weight_kg: 62.5, reps: 7 });
    expect(await stored("session_exercise", newExercise)).toBeUndefined();
    // A delete whose expectation still holds goes through, with or without a known tick.
    expect(
      await me.send([
        { op: "DELETE", table: "session_set", id: t.set1, expect: { completed_at: null } },
      ]),
    ).toEqual(applied);
    expect(await deletedAt("session_set", t.set1)).not.toBeNull();
    expect(
      await me.send([
        { op: "DELETE", table: "session_set", id: t.set2, expect: { completed_at: ticked } },
      ]),
    ).toEqual(applied);
    // A stale in-place swap (same type, nothing completed in the snapshot) cannot take a
    // completed set for the replacement.
    const other = await training(me);
    expect(
      await otherDevice.send([
        op("PATCH", "session_set", other.set1, { weight_kg: 50, reps: 5, completed_at: ticked }),
      ]),
    ).toEqual(applied);
    expect(
      await me.send([
        op("PATCH", "session_exercise", other.exerciseId, {
          exercise_id: replacementId,
          exercise_title: "Replacement press",
        }),
      ]),
    ).toMatchObject(rejected("SYNC_CONSTRAINT_VIOLATION"));
    expect(await stored("session_exercise", other.exerciseId)).toMatchObject({
      exercise_id: weightReps,
    });
  });

  it("rolls back a session swap when the workout side of its upload is rejected", async () => {
    const me = await writer("workout-swap-rollback@example.com");
    const workout = uuidv7();
    const missingWorkoutExercise = uuidv7();
    const session = uuidv7();
    const entry = uuidv7();
    expect(
      await me.send([
        op("PUT", "workout", workout, { title: "Legs" }),
        putSession(session, { workout_id: workout }),
        putExercise(entry, session, weightReps, {
          source_workout_exercise_id: missingWorkoutExercise,
        }),
      ]),
    ).toEqual(applied);

    expect(
      await me.send([
        op("PATCH", "session_exercise", entry, {
          exercise_id: duration,
          exercise_type: "duration",
          exercise_title: "Plank",
        }),
        op("PATCH", "workout_exercise", missingWorkoutExercise, { exercise_id: duration }),
      ]),
    ).toMatchObject(rejected("SYNC_ROW_NOT_FOUND"));
    expect(await stored("session_exercise", entry)).toMatchObject({ exercise_id: weightReps });
  });

  it("enforces 40 exercises per Session and 20 sets per exercise, also on restore", async () => {
    const me = await writer("session-limits@example.com");
    const sessionId = uuidv7();
    const exercises = Array.from({ length: SESSION_LIMITS.exercisesPerSession }, () => uuidv7());
    expect(
      await me.send([
        putSession(sessionId),
        ...exercises.map((id, index) =>
          putExercise(id, sessionId, weightReps, {
            position: `a${String(index).padStart(2, "0")}`,
          }),
        ),
      ]),
    ).toEqual(applied);
    const limit = rejected("SESSION_LIMIT_REACHED");
    expect(await me.send([putExercise(uuidv7(), sessionId)])).toMatchObject(limit);
    // One goes, one comes; then the deleted one cannot come back over the limit.
    const gone = exercises[0] ?? "";
    expect(await me.send([op("DELETE", "session_exercise", gone)])).toEqual(applied);
    expect(await me.send([putExercise(uuidv7(), sessionId)])).toEqual(applied);
    expect(await me.send([putExercise(gone, sessionId, weightReps, {}, true)])).toMatchObject(
      limit,
    );
    // A replace of a live exercise is never a new one.
    expect(
      await me.send([putExercise(exercises[1] ?? "", sessionId, weightReps, { note: "Same" })]),
    ).toEqual(applied);

    const exerciseId = exercises[1] ?? "";
    const sets = Array.from({ length: SESSION_LIMITS.setsPerExercise }, () => uuidv7());
    expect(
      await me.send(
        sets.map((id, index) =>
          putSet(id, exerciseId, { position: `a${String(index).padStart(2, "0")}` }),
        ),
      ),
    ).toEqual(applied);
    expect(await me.send([putSet(uuidv7(), exerciseId)])).toMatchObject(limit);
    expect(await me.send([op("DELETE", "session_set", sets[0] ?? "")])).toEqual(applied);
    expect(await me.send([putSet(uuidv7(), exerciseId)])).toEqual(applied);
    expect(await me.send([putSet(sets[0] ?? "", exerciseId, {}, true)])).toMatchObject(limit);
  });

  it("limits the start of a Session to the last 10 years and not the future", async () => {
    const me = await writer("session-dates@example.com");
    const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    const outside = rejected("SESSION_DATE_OUT_OF_RANGE");
    expect(await me.send([putSession(uuidv7(), { started_at: days(1) })])).toMatchObject(outside);
    expect(await me.send([putSession(uuidv7(), { started_at: days(-3660) })])).toMatchObject(
      outside,
    );
    const past = uuidv7();
    expect(
      await me.send([
        putSession(past, { started_at: days(-3600), finished_at: days(-3600 + 0.04) }),
      ]),
    ).toEqual(applied);
    // Moving the start is checked too; a patch that leaves it alone is not.
    expect(
      await me.send([
        op("PATCH", "training_session", past, { started_at: days(2), finished_at: null }),
      ]),
    ).toMatchObject(outside);
    expect(await me.send([op("PATCH", "training_session", past, { title: "Old one" })])).toEqual(
      applied,
    );
    // A set of a past Session is fine.
    expect(await stored("training_session", past)).toMatchObject({ title: "Old one" });
  });

  it("keeps one setting per exercise: a second device's setting joins the first", async () => {
    const me = await writer("session-setting@example.com");
    const first = uuidv7();
    const second = uuidv7();
    expect(await me.send([putSetting(first, weightReps, { log_effort: 1 })])).toEqual(applied);
    expect(await me.send([putSetting(second, weightReps, { log_effort: 0 })])).toEqual(applied);
    const rows = await app.rows(
      sql`SELECT id, log_effort FROM exercise_setting WHERE user_id = ${me.userId} AND exercise_id = ${weightReps} AND deleted_at IS NULL`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first, log_effort: false });
    expect(await stored("exercise_setting", second)).toBeUndefined();
    // Another exercise gets its own.
    expect(await me.send([putSetting(uuidv7(), bodyweight)])).toEqual(applied);
  });
});
