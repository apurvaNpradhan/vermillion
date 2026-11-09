import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "./fake-database";
import {
  purgeOrphanRejectedWrites,
  watchRejectedWrites,
  type RejectedWritesDatabase,
} from "./rejected-writes";
import { SYNCED_TABLE_NAMES } from "./schema";

function addRows(sqlite: DatabaseSync, tables: string[]) {
  const insert = sqlite.prepare(
    "INSERT INTO rejected_writes VALUES (?, 't', 0, 1, ?, 'r', 'PUT', 'X', '{}', 0, ?)",
  );
  tables.forEach((table, n) =>
    insert.run(`id${n}`, table, `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`),
  );
}

describe("rejected writes", () => {
  it("limits a table's writes in the query, so another table's rows cannot crowd them out", () => {
    const { sqlite } = createFakeDatabase();
    addRows(sqlite, ["notes", "notes", "notes", "notes", "notes", "exercise"]);
    // PowerSync's reactive watch is the platform boundary: this runs the query once, on real SQLite.
    const database = {
      watchWithCallback: (
        sql: string,
        params: Array<string | number>,
        handler: { onResult: (result: { array: unknown[] }) => void },
      ) => handler.onResult({ array: sqlite.prepare(sql).all(...params) }),
    };
    let seen: string[] = [];
    watchRejectedWrites(
      // Safety: the double implements the one method the watch calls.
      database as never as RejectedWritesDatabase,
      { onResult: ({ writes }) => (seen = writes.map((w) => w.table)), onError: () => undefined },
      2,
      "exercise",
    );
    expect(seen).toEqual(["exercise"]);
  });

  it("purges writes of tables that no longer sync and keeps the rest", async () => {
    const { sqlite, database } = createFakeDatabase();
    addRows(sqlite, ["notes", "exercise", "notes"]);
    // Safety: the fake implements the transaction method the purge calls.
    const db = database as never as RejectedWritesDatabase;
    expect(await purgeOrphanRejectedWrites(db, SYNCED_TABLE_NAMES)).toBe(2);
    expect(sqlite.prepare("SELECT table_name FROM rejected_writes").all()).toEqual([
      { table_name: "exercise" },
    ]);
  });
});
