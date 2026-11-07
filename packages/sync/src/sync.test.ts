import { DatabaseSync } from "node:sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  REJECTED_PAYLOAD_MAX_BYTES,
  boundPayload,
  ensureInstallId,
  powerSyncSchema,
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

  it("has the synced notes table and two local-only tables", () => {
    expect(Object.keys(tables).sort()).toEqual(["install_meta", "notes", "rejected_writes"]);
    expect(tables.notes?.localOnly).toBe(false);
    expect(tables.install_meta?.localOnly).toBe(true);
    expect(tables.rejected_writes?.localOnly).toBe(true);
  });

  it("indexes the notes sort keys", () => {
    const index = tables.notes?.indexes.find((i) => i.name === "notes_live_updated_at_idx");
    expect(index?.columns.map((c) => c.name)).toEqual(["deleted_at", "updated_at", "id"]);
  });

  it("does not declare id as a column (PowerSync adds it)", () => {
    expect(tables.notes?.columns.map((c) => c.name)).not.toContain("id");
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
