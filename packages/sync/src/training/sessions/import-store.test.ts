import {
  sha256Hex,
  SYNC_LIMITS,
  type PlannedImportSession,
  type SyncUploadRequest,
} from "@workspace/shared";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { createConnector } from "../../platform/connector";
import { crudEntry } from "../../platform/fake-database";
import { uploadColumns } from "../../platform/upload-columns";
import { readMatchingLibrary } from "../../exercise/matching-library";
import {
  batchImportSessions,
  importSessionBatch,
  importSessionCost,
  newImportBatchId,
  readImportFingerprints,
  watchImportedSessions,
  type ImportedSessions,
  undoImportChunk,
} from "./import-store";
import { addSet } from "./session-content-store";
import { addSessionPhoto } from "./photo-store";
import { adoptLegacyImportReceipt, readImportReceipt, type ImportReceipt } from "./import-receipt";
import { PLANK, SQUAT, setupSessions, type Sessions } from "./session-fixtures";

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function planned(
  startedAt: string,
  overrides: Partial<PlannedImportSession> = {},
): PlannedImportSession {
  return {
    key: startedAt,
    fingerprint: sha256Hex(startedAt),
    title: "Push Day",
    note: "Shoulder tight",
    startedAt,
    durationS: 3600,
    exercises: [
      {
        exerciseId: SQUAT,
        title: "Squat",
        type: "weight_reps",
        note: null,
        supersetKey: "s",
        logEffort: true,
        sets: [
          { kind: "warmup", weightKg: 40, reps: 8, durationS: null, distanceM: null, rpe: null },
          { kind: "working", weightKg: 100, reps: 5, durationS: null, distanceM: null, rpe: 8 },
        ],
      },
      {
        exerciseId: PLANK,
        title: "Plank",
        type: "duration",
        note: "Slow",
        supersetKey: "s",
        logEffort: false,
        sets: [
          {
            kind: "working",
            weightKg: null,
            reps: null,
            durationS: 60,
            distanceM: null,
            rpe: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("importSessionBatch", () => {
  it("writes finished Sessions with their exercises and ticked sets, tagged with the batch", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    const started = day(10);
    const result = await importSessionBatch(s.training, batch, [planned(started)]);
    expect(result).toMatchObject({ sessions: 1, sets: 3, duplicates: 0 });

    const [row] = s.all("training_session");
    expect(row).toMatchObject({
      user_id: "owner",
      import_batch_id: batch,
      title: "Push Day",
      title_derived: 0,
      note: "Shoulder tight",
      started_at: started,
      finished_at: new Date(Date.parse(started) + 3_600_000).toISOString(),
      duration_s: 3600,
      workout_id: null,
      program_id: null,
      run_id: null,
      slot_id: null,
      cycle: null,
      rest_set_id: null,
      device_id: s.installId,
    });
    const exercises = s.exercises(String(row?.["id"]));
    expect(exercises.map((item) => item["exercise_title"])).toEqual(["Squat", "Plank"]);
    expect(exercises[0]).toMatchObject({
      log_effort: 1,
      exercise_type: "weight_reps",
      user_id: "owner",
    });
    expect(exercises[0]?.["superset_group"]).toBe(exercises[1]?.["superset_group"]);
    expect(exercises[0]?.["superset_group"]).not.toBeNull();
    const sets = s.sets(String(exercises[0]?.["id"]));
    expect(sets.map((item) => item["kind"])).toEqual(["warmup", "working"]);
    expect(sets[1]).toMatchObject({ weight_kg: 100, reps: 5, rpe: 8 });
    expect(sets.every((item) => item["completed_at"] !== null)).toBe(true);
    expect(s.all("program_run")).toHaveLength(0);
  });

  it("writes whole Sessions or none: an invalid one rolls the batch back", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    await expect(
      importSessionBatch(s.training, batch, [planned(day(5)), planned("2001-01-01T00:00:00.000Z")]),
    ).rejects.toThrow("10 years");
    expect(s.all("training_session")).toHaveLength(0);
    expect(s.all("session_exercise")).toHaveLength(0);
    expect(s.all("session_set")).toHaveLength(0);
  });

  it("refuses to write for a device account that changed", async () => {
    const s = await setupSessions();
    await expect(
      importSessionBatch(s.training, newImportBatchId(), [planned(day(2))], "someone-else"),
    ).rejects.toThrow("account changed");
    expect(s.all("training_session")).toHaveLength(0);
  });
});

function receipt(batchId: string): ImportReceipt {
  return {
    batchId,
    importedAt: day(0),
    format: "strong",
    sessions: 0,
    sets: 0,
    createdExercises: 0,
    skippedDuplicates: 0,
    skippedOther: 0,
    omittedSets: 2,
    omittedExercises: 1,
    oversized: 0,
    from: null,
    to: null,
    complete: false,
    undoStarted: false,
  };
}

describe("dedupe and recovery", () => {
  it("adopts an older receipt only for the account with its matching batch", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    const legacy = JSON.stringify(receipt(batch));
    expect(await adoptLegacyImportReceipt(s.training, "owner", s.installId, legacy)).toBeNull();
    await importSessionBatch(s.training, batch, [planned(day(2))]);
    expect(await adoptLegacyImportReceipt(s.training, "other", s.installId, legacy)).toBeNull();
    expect(await adoptLegacyImportReceipt(s.training, "owner", s.installId, legacy)).toMatchObject({
      batchId: batch,
      legacy: true,
    });
    expect(await readImportReceipt(s.training, "owner")).toMatchObject({
      batchId: batch,
      legacy: true,
    });
  });

  it("rechecks fingerprints at write time and dedupes within and across batches", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    const startedAt = day(3);
    const workout = planned(startedAt);
    const remapped = {
      ...workout,
      exercises: workout.exercises.map((entry) => ({ ...entry, title: "Renamed" })),
    };
    const distinct = planned(new Date(Date.parse(startedAt) + 30_000).toISOString(), {
      exercises: workout.exercises.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set, reps: 12 })),
      })),
    });
    const knownBeforeWrite = await readImportFingerprints(s.training, {
      from: day(10),
      to: day(0),
    });
    expect(knownBeforeWrite.size).toBe(0);
    const first = await importSessionBatch(
      s.training,
      batch,
      [workout, remapped],
      s.installId,
      receipt(batch),
    );
    expect(first).toMatchObject({ sessions: 1, duplicates: 1 });
    const saved = await readImportReceipt(s.training, "owner");
    expect(saved).toMatchObject({
      batchId: batch,
      sessions: 1,
      sets: 3,
      complete: false,
      skippedDuplicates: 1,
    });
    expect(await readImportReceipt(s.training, "someone-else")).toBeNull();

    const result = await importSessionBatch(
      s.training,
      batch,
      [remapped, distinct],
      s.installId,
      saved ?? undefined,
    );
    expect(result).toMatchObject({ sessions: 1, duplicates: 1 });
    expect(await readImportReceipt(s.training, "owner")).toMatchObject({
      sessions: 2,
      sets: 6,
      skippedDuplicates: 2,
    });
    const known = await readImportFingerprints(s.training, { from: day(10), to: day(0) });
    expect(known).toEqual(new Set([workout.fingerprint, distinct.fingerprint]));
  });
});

const capturedRow = z.object({
  kind: z.enum(["PUT", "PATCH"]),
  row_id: z.string(),
  table_name: z.string(),
  payload: z.string(),
});

/** Simulate PowerSync's CRUD capture at the fake database boundary using the actual SQLite writes. */
function captureCrud(s: Sessions) {
  s.sqlite.exec(
    "CREATE TEMP TABLE import_crud (kind TEXT, row_id TEXT, table_name TEXT, payload TEXT)",
  );
  for (const table of ["training_session", "session_exercise", "session_set"]) {
    const columns = s.sqlite.prepare(`PRAGMA table_info(${table})`).all();
    const fields = columns.flatMap(({ name }) => (name === "id" ? [] : [`'${name}', NEW.${name}`]));
    s.sqlite.exec(`
      CREATE TEMP TRIGGER capture_${table} AFTER INSERT ON ${table} BEGIN
        INSERT INTO import_crud VALUES ('PUT', NEW.id, '${table}', json_object(${fields.join(", ")}));
      END;
    `);
  }
  s.sqlite.exec(`
    CREATE TEMP TRIGGER capture_undo AFTER UPDATE OF import_undo ON training_session BEGIN
      INSERT INTO import_crud VALUES ('PATCH', NEW.id, 'training_session', json_object('import_undo', NEW.import_undo));
    END;
  `);
  return () => {
    const rows = z
      .array(capturedRow)
      .parse(s.sqlite.prepare("SELECT * FROM import_crud ORDER BY rowid").all());
    s.sqlite.exec("DELETE FROM import_crud");
    s.queue(
      rows.map(({ kind, row_id, table_name, payload }) => {
        const data = z
          .record(z.string(), z.union([z.string(), z.number(), z.null()]))
          .parse(JSON.parse(payload));
        return crudEntry(
          kind,
          row_id,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null)),
          table_name,
        );
      }),
    );
  };
}

describe("connector budgeting", () => {
  it("imports more than 100 CRUD rows and queues more than 100 guarded cascades in bounded transactions", async () => {
    const s = await setupSessions();
    const capture = captureCrud(s);
    const batch = newImportBatchId();
    const workouts = Array.from({ length: 101 }, (_, index) => planned(day(index + 1)));
    const uploaded: SyncUploadRequest[] = [];
    const connector = createConnector({
      database: s.database,
      uploadColumns,
      onSignal: () => undefined,
      transport: {
        credentials: async () => {
          throw new Error("Not used by uploadData");
        },
        upload: async (request) => {
          uploaded.push(request);
          return { status: "applied" };
        },
      },
    });

    let saved = receipt(batch);
    for (const chunk of batchImportSessions(workouts)) {
      const result = await importSessionBatch(s.training, batch, chunk, s.installId, saved);
      saved = result.receipt ?? saved;
      capture();
      await connector.uploadData();
    }
    expect(uploaded.reduce((count, request) => count + request.ops.length, 0)).toBe(606);
    expect(uploaded.every(({ ops }) => ops.length <= SYNC_LIMITS.maxOps)).toBe(true);
    expect(saved.sessions).toBe(101);

    uploaded.length = 0;
    let cursor = "";
    for (const expected of [100, 1]) {
      const result = await undoImportChunk(s.training, batch, cursor, s.installId);
      expect(result.scanned).toBe(expected);
      cursor = result.cursor ?? "";
      capture();
      await connector.uploadData();
    }
    expect(uploaded.map(({ ops }) => ops.length)).toEqual([100, 1]);
    expect(
      uploaded
        .flatMap(({ ops }) => ops)
        .every((op) => String(op.opData?.import_undo).startsWith(`${batch}:`)),
    ).toBe(true);
    expect(s.all("rejected_writes")).toEqual([]);
    expect(await readImportReceipt(s.training, "owner")).toMatchObject({
      batchId: batch,
      undoStarted: true,
    });
    expect(s.all("training_session")).toHaveLength(101); // Until PowerSync confirms the cascade.
  });

  it("refuses a single oversized workout at preview and in the writer", async () => {
    const s = await setupSessions();
    const workout = planned(day(1));
    workout.exercises = Array.from({ length: 34 }, () => workout.exercises[0]!);
    expect(importSessionCost(workout)).toBeNull();
    await expect(importSessionBatch(s.training, newImportBatchId(), [workout])).rejects.toThrow(
      "sync transaction budget",
    );
    expect(s.all("training_session")).toHaveLength(0);
    expect(s.all("session_exercise")).toHaveLength(0);
  });
});

describe("undo safety", () => {
  it("keeps photos and added sets and reports their workouts while untouched workouts are queued", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    await importSessionBatch(s.training, batch, [
      planned(day(1), { title: "With photo" }),
      planned(day(2), { title: "With extra set" }),
      planned(day(3), { title: "Untouched" }),
    ]);
    const rows = s.all("training_session");
    s.sqlite
      .prepare("INSERT INTO session_photo (id, session_id) VALUES (?, ?)")
      .run("photo", rows[0]!.id!);
    const exercise = s.exercises(String(rows[1]?.id))[0];
    s.sqlite
      .prepare("INSERT INTO session_set (id, session_exercise_id) VALUES (?, ?)")
      .run("extra", exercise!.id!);
    await undoImportChunk(s.training, batch, "", s.installId);
    expect(s.all("training_session").map((row) => row.import_undo)).toEqual([
      null,
      null,
      expect.stringContaining(`${batch}:`),
    ]);

    const values: ImportedSessions[] = [];
    const stop = watchImportedSessions(
      s.training,
      batch,
      (value) => values.push(value),
      () => {
        throw new Error("Unable to read the receipt");
      },
    );
    expect(values[0]).toMatchObject({
      sessions: 3,
      pending: 1,
      kept: [{ title: "With extra set" }, { title: "With photo" }],
    });
    stop();
    expect(s.all("session_photo")).toHaveLength(1);
    expect(s.all("session_set")).toHaveLength(10);
  });

  it("protects an offline queued undo from new local sets and photos, then allows a rejected undo to be retried", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    await importSessionBatch(s.training, batch, [planned(day(1))], s.installId, receipt(batch));
    await undoImportChunk(s.training, batch, "", s.installId);
    const [session] = s.all("training_session");
    const id = String(session?.id);
    const [exercise] = s.exercises(id);
    const exerciseId = String(exercise?.id);
    const image = { width: 512, height: 512, bytes: 1000, thumbBytes: 100 };

    await expect(addSet(s.training, exerciseId)).rejects.toThrow("undo is pending");
    await expect(addSessionPhoto(s.training, id, image)).rejects.toThrow("undo is pending");
    expect(s.all("session_set")).toHaveLength(3);
    expect(s.all("session_photo")).toEqual([]);

    const marker = String(session?.import_undo);
    s.sqlite
      .prepare(`INSERT INTO rejected_writes (id, table_name, row_id, op, payload)
      VALUES ('other', 'training_session', ?, 'PATCH', ?)`)
      .run(id, JSON.stringify({ import_undo: marker }));
    await undoImportChunk(s.training, batch, "", s.installId);
    expect(s.one("training_session", id)?.import_undo).not.toBe(marker);
    expect(await readImportReceipt(s.training, "owner")).toMatchObject({ undoStarted: true });
  });
});

describe("readMatchingLibrary", () => {
  it("lists live catalog and own exercises, leaving out archived ones", async () => {
    const s = await setupSessions();
    s.sqlite
      .prepare(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
           exercise_type, is_full_bodyweight, retired_at, created_at)
         VALUES (?, ?, ?, 'other', '[]', 'none', 'duration', 0, ?, 'now')`,
      )
      .run("0192f0a0-0000-7000-8000-0000000000aa", "owner", "Old thing", "2026-01-01");
    const library = await readMatchingLibrary(s.training);
    expect(library.map((item) => item.title).sort()).toEqual([
      "Assisted dip",
      "Curl",
      "Plank",
      "Push-up",
      "Squat",
    ]);
    expect(library.find((item) => item.title === "Plank")).toMatchObject({
      custom: false,
      exerciseType: "duration",
    });
  });
});
