import { readFileSync } from "node:fs";

import { DatabaseSync } from "node:sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  REJECTED_PAYLOAD_MAX_BYTES,
  boundPayload,
  ensureInstallId,
  powerSyncSchema,
  SYNCED_TABLE_NAMES,
  uploadColumns,
  storageRowToWire,
  wireRowToStorage,
  type InstallMetaDatabase,
} from "./index";

const modes = sqliteTable("modes", {
  id: text("id").primaryKey().notNull(),
  // Names are deliberately misleading: conversion must follow the column mode.
  title: integer("title", { mode: "boolean" }),
  flag: text("flag", { mode: "json" }),
  seen: integer("seen", { mode: "timestamp_ms" }),
  made: integer("made", { mode: "timestamp" }),
  plain: text("plain"),
});

describe("row conversion", () => {
  it("decodes by column mode, not column name", () => {
    const wire = storageRowToWire(modes, {
      id: "a",
      title: 1,
      flag: '{"x":[1,2]}',
      seen: 1_700_000_000_123,
      made: 1_700_000_000,
      plain: "hi",
    });
    expect(wire).toEqual({
      id: "a",
      title: true,
      flag: { x: [1, 2] },
      seen: "2023-11-14T22:13:20.123Z",
      made: "2023-11-14T22:13:20.000Z",
      plain: "hi",
    });
  });

  it("round-trips wire to storage and back", () => {
    const wire = {
      id: "a",
      title: false,
      flag: { x: [1, 2] },
      seen: "2023-11-14T22:13:20.123Z",
      made: "2023-11-14T22:13:20.000Z",
      plain: null,
    };
    const storage = wireRowToStorage(modes, wire);
    expect(storage).toEqual({
      id: "a",
      title: 0,
      flag: '{"x":[1,2]}',
      seen: 1_700_000_000_123,
      made: 1_700_000_000,
      plain: null,
    });
    expect(storageRowToWire(modes, storage)).toEqual(wire);
  });

  it("leaves absent columns absent and ignores unknown ones", () => {
    expect(storageRowToWire(modes, { plain: "x", nope: "y" })).toEqual({ plain: "x" });
    expect(wireRowToStorage(modes, { plain: "x", nope: "y" })).toEqual({ plain: "x" });
  });
});

describe("powerSyncSchema", () => {
  const tables = Object.fromEntries(powerSyncSchema.tables.map((table) => [table.name, table]));

  it("has the synced tables and five local-only tables", () => {
    expect(Object.keys(tables).sort()).toEqual([
      "attachments",
      "body_measurement",
      "device_owner",
      "exercise",
      "exercise_pin",
      "exercise_setting",
      "gym",
      "gym_equipment",
      "gym_exercise_setting",
      "history_import_receipt",
      "install_meta",
      "media",
      "program",
      "program_run",
      "program_slot",
      "program_slot_skip",
      "progress_photo",
      "rejected_writes",
      "session_exercise",
      "session_photo",
      "session_set",
      "training_session",
      "user_preferences",
      "workout",
      "workout_exercise",
    ]);
    const synced = [
      "body_measurement",
      "exercise",
      "exercise_pin",
      "exercise_setting",
      "gym",
      "gym_equipment",
      "gym_exercise_setting",
      "media",
      "program",
      "program_run",
      "program_slot",
      "program_slot_skip",
      "progress_photo",
      "session_exercise",
      "session_photo",
      "session_set",
      "training_session",
      "user_preferences",
      "workout",
      "workout_exercise",
    ];
    for (const name of synced) expect(tables[name]?.localOnly, name).toBe(false);
    expect([...SYNCED_TABLE_NAMES].sort()).toEqual(synced);
    expect(tables.install_meta?.localOnly).toBe(true);
    // The state of the media files stays on the device: never synced, never uploaded.
    expect(tables.attachments?.localOnly).toBe(true);
    expect(uploadColumns.has("attachments")).toBe(false);
    expect(tables.rejected_writes?.localOnly).toBe(true);
    expect(tables.history_import_receipt?.localOnly).toBe(true);
    expect(uploadColumns.has("history_import_receipt")).toBe(false);
  });

  it("indexes the exercise filter and sort keys", () => {
    const indexed = tables.exercise?.indexes.flatMap((i) => i.columns.map((c) => c.name));
    expect(indexed?.toSorted()).toEqual(["equipment", "primary_muscle", "retired_at", "title"]);
  });

  it("indexes the training ordering and parent keys", () => {
    const indexed = (name: string) =>
      tables[name]?.indexes.map((index) => index.columns.map((c) => c.name));
    expect(indexed("workout_exercise")).toContainEqual(["workout_id", "position"]);
    expect(indexed("program_slot")).toContainEqual(["program_id", "position"]);
    expect(indexed("workout")).toContainEqual(["program_id"]);
  });

  it("indexes the session keys Previous, Records and History read through", () => {
    const indexed = (name: string) =>
      tables[name]?.indexes.map((index) => index.columns.map((c) => c.name));
    expect(indexed("session_exercise")).toContainEqual(["exercise_id"]);
    expect(indexed("session_exercise")).toContainEqual(["session_id", "position"]);
    expect(indexed("session_set")).toContainEqual(["session_exercise_id", "position"]);
    expect(indexed("training_session")).toContainEqual(["started_at"]);
    expect(indexed("training_session")).toContainEqual(["finished_at"]);
    expect(indexed("training_session")).toContainEqual(["import_fingerprint"]);
    expect(indexed("exercise_pin")).toContainEqual(["exercise_id"]);
    expect(indexed("exercise_setting")).toContainEqual(["exercise_id"]);
    expect(indexed("gym_equipment")).toContainEqual(["gym_id"]);
    expect(indexed("gym_exercise_setting")).toContainEqual(["exercise_id", "gym_id"]);
    expect(indexed("training_session")).toContainEqual(["gym_id"]);
  });

  it("has the training stream columns and the upload-only markers", () => {
    const config = readFileSync(
      new URL("../../../powersync/sync-config.yaml", import.meta.url),
      "utf8",
    );
    const streams = config.matchAll(/- SELECT (.+?) FROM (\w+) WHERE user_id = auth\.user_id\(\)/g);
    const checked: string[] = [];
    for (const [, columns, table] of streams) {
      const local = tables[table ?? ""];
      if (!local || !table?.match(/program|workout|session|gym|exercise_setting/)) continue;
      checked.push(table);
      const names = local.columns.map((column) => column.name);
      // PowerSync adds `id`. Upload-only markers are written by the device.
      const listed = (columns ?? "").split(", ").filter((name) => name !== "id");
      const writeOnly = ["restore"];
      if (table === "training_session") writeOnly.push("import_undo");
      if (table === "gym_equipment") writeOnly.push("seed");
      expect(names.filter((name) => !writeOnly.includes(name)).sort(), table).toEqual(
        listed.sort(),
      );
      // Runs and Slot skips are never restored by Undo, so they carry no marker.
      if (table !== "program_run" && table !== "program_slot_skip")
        expect(names, table).toEqual(expect.arrayContaining(writeOnly));
    }
    expect(checked.sort()).toEqual([
      "exercise_setting",
      "gym",
      "gym_equipment",
      "gym_exercise_setting",
      "program",
      "program_run",
      "program_slot",
      "program_slot_skip",
      "session_exercise",
      "session_photo",
      "session_set",
      "training_session",
      "workout",
      "workout_exercise",
    ]);
  });

  it("has the columns the media stream lists, and indexes the kind", () => {
    const config = readFileSync(
      new URL("../../../powersync/sync-config.yaml", import.meta.url),
      "utf8",
    );
    const listed = /SELECT (.+?) FROM media WHERE user_id = auth\.user_id\(\)/.exec(config)?.[1];
    const names = tables.media?.columns.map((column) => column.name);
    expect(names?.toSorted()).toEqual(
      (listed ?? "")
        .split(", ")
        .filter((n) => n !== "id")
        .toSorted(),
    );
    expect(tables.media?.indexes.map((index) => index.columns.map((c) => c.name))).toContainEqual([
      "kind",
    ]);
    // Uploads carry what the server's media handler accepts, nothing it owns.
    expect([...(uploadColumns.get("media") ?? [])].toSorted()).toEqual(
      ["bytes", "height", "kind", "mime", "thumb_bytes", "width"].toSorted(),
    );
  });

  it("uploads only the columns the server accepts, never server-owned ones", () => {
    for (const [table, columns] of uploadColumns) {
      expect(columns.has("user_id"), table).toBe(false);
      expect(columns.has("created_at"), table).toBe(false);
    }
    expect(uploadColumns.get("program")?.has("cover_key")).toBe(false);
    expect(uploadColumns.get("program")?.has("cover_media_id")).toBe(true);
    expect(uploadColumns.get("workout_exercise")?.has("sets")).toBe(true);
    expect([...uploadColumns.keys()].sort()).toEqual([...SYNCED_TABLE_NAMES].sort());
  });

  it("does not declare id as a column (PowerSync adds it)", () => {
    expect(tables.exercise?.columns.map((c) => c.name)).not.toContain("id");
  });
});

describe("boundPayload", () => {
  it("keeps small payloads whole", () => {
    expect(boundPayload({ title: "x" })).toEqual({ payload: '{"title":"x"}', truncated: false });
  });

  it("truncates to the byte cap without splitting a character", () => {
    const result = boundPayload({ body: "😀".repeat(REJECTED_PAYLOAD_MAX_BYTES) });
    expect(result.truncated).toBe(true);
    expect(new TextEncoder().encode(result.payload).length).toBeLessThanOrEqual(
      REJECTED_PAYLOAD_MAX_BYTES,
    );
    expect(result.payload).not.toContain("�");
    expect(result.payload.endsWith("😀")).toBe(true);
  });
});

describe("ensureInstallId", () => {
  /** A real SQLite file standing in for the PowerSync local-only view. */
  function openDatabase(): InstallMetaDatabase {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
      "CREATE TABLE install_meta (id TEXT PRIMARY KEY, install_id TEXT, created_at TEXT)",
    );
    const tx = {
      getOptional: async (sql: string, params: string[] = []) =>
        sqlite.prepare(sql).get(...params) ?? null,
      execute: async (sql: string, params: string[] = []) => sqlite.prepare(sql).run(...params),
    };
    // Safety: the test double implements the two Transaction methods ensureInstallId calls.
    return { writeTransaction: async (fn) => fn(tx as never) } as InstallMetaDatabase;
  }

  it("creates a UUIDv7 once and returns it on every later call", async () => {
    const database = openDatabase();
    const first = await ensureInstallId(database);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await ensureInstallId(database)).toBe(first);
  });
});
