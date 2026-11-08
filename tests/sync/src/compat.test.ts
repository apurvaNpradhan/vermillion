import { column, Schema, Table } from "@powersync/common";
import { SYNC_SCHEMA_VERSION } from "@workspace/shared";
import { listNotesQuery, powerSyncSchema } from "@workspace/sync";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { useSyncSuite, within } from "./support/suite";
import { createUser, database, serverNote } from "./support/users";

// Seam 3, phase 7: client/server compatibility (ADR 0018/0019) and local read performance.

const newClient = useSyncSuite();

describe("old clients", () => {
  it("pauses a client outside the schema window, keeps every write and resumes after the update", async () => {
    const user = await createUser();
    const client = await newClient(user, { schemaVersion: SYNC_SCHEMA_VERSION + 1 });
    await client.connect();
    const [first, second] = [uuidv7(), uuidv7()];
    await client.createNote(first, "Kept one", "1");
    await client.createNote(second, "Kept two", "2");

    // The server refuses (not a verdict on the writes); the connector keeps retrying.
    await vi.waitFor(() => {
      const refusals = client.records.filter(
        (r) => r.kind === "error" && r.code === "SYNC_CLIENT_INCOMPATIBLE",
      );
      expect(refusals.length).toBeGreaterThanOrEqual(2);
    }, within);
    expect(client.outcomes().size).toBe(0);
    expect(await client.queued()).toBe(2);
    expect(await serverNote(first)).toBeUndefined();
    expect(await serverNote(second)).toBeUndefined();
    expect(await client.noteIds()).toHaveLength(2); // the writes are still on the device

    // "Update the app": the client now speaks a supported version; the same queue drains.
    client.transport.schemaVersion = SYNC_SCHEMA_VERSION;
    await client.uploaded();
    expect([...client.outcomes().values()].map((o) => o.status)).toEqual(["applied", "applied"]);
    expect(await serverNote(first)).toMatchObject({ title: "Kept one", body: "1" });
    expect(await serverNote(second)).toMatchObject({ title: "Kept two", body: "2" });
  });

  it("applies writes queued by a client from before a column existed, defaults included", async () => {
    const user = await createUser();
    // The old build's table knows `title` only: no body, no timestamps.
    const oldSchema = new Schema({ notes: new Table({ title: column.text }) });
    const old = await newClient(user, {}, oldSchema);
    const current = await newClient(user);
    await Promise.all([old.connect(), current.connect()]);
    await old.disconnect();

    const id = uuidv7();
    await old.database.execute("INSERT INTO notes (id, title) VALUES (?, ?)", [
      id,
      "From the past",
    ]);
    await old.database.execute("UPDATE notes SET title = ? WHERE id = ?", [
      "Edited in the past",
      id,
    ]);
    await old.connect();
    await old.uploaded();

    expect([...old.outcomes().values()].map((o) => o.status)).toEqual(["applied", "applied"]);
    // The omitted body took the server default; the new device sees a complete row.
    expect(await serverNote(id)).toMatchObject({ title: "Edited in the past", body: "" });
    await vi.waitFor(
      async () => expect(await current.note(id)).toMatchObject({ title: "Edited in the past" }),
      within,
    );
    // The stream carries columns the old build does not know; it ignores them and keeps working.
    const newer = uuidv7();
    await current.createNote(newer, "Newer", "with a body");
    await vi.waitFor(async () => expect(await old.noteIds()).toContain(newer), within);
  });

  it("answers a write that a newer validator no longer accepts with a recorded rejection", async () => {
    const user = await createUser();
    const client = await newClient(user);
    await client.connect();
    await client.disconnect();
    const stale = uuidv7();
    // An older build allowed an empty title; today's validator refuses it.
    await client.createNote(stale, "");
    await client.connect();
    await client.uploaded();
    expect([...client.outcomes().values()]).toEqual([
      expect.objectContaining({ status: "rejected", code: "SYNC_INVALID_OP" }),
    ]);
    expect(await serverNote(stale)).toBeUndefined();
  });
});

describe("local reads", () => {
  it("serves the notes list from the local index, not a table scan or a sort", async () => {
    const user = await createUser();
    const client = await newClient(user, {}, powerSyncSchema);
    // The real list query, as the product code builds it.
    const list = listNotesQuery(client.database, 50 + 1).toSQL();
    const listSql = list.sql;
    expect(listSql).toContain('from "notes"');

    await client.database.writeTransaction(async (tx) => {
      for (let n = 0; n < 1_000; n++) {
        await tx.execute(
          `INSERT INTO notes (id, user_id, title, body, created_at, updated_at)
           VALUES (?, ?, ?, '', ?, ?)`,
          [
            uuidv7(),
            user.userId,
            `Note ${n}`,
            new Date(n * 1000).toISOString(),
            new Date(n * 1000).toISOString(),
          ],
        );
      }
    });
    const plan = await client.database.getAll<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${listSql}`,
      list.params,
    );
    const details = plan.map((row) => row.detail).join("\n");
    expect(details).toContain("notes_live_updated_at_idx");
    expect(details).not.toMatch(/SCAN notes\b|SCAN ps_data__notes\b/);
    expect(details).not.toContain("USE TEMP B-TREE FOR ORDER BY");
  });
});

describe("first sync", () => {
  it("downloads a thousand notes into an empty device (measurement, not a gate)", async () => {
    const user = await createUser();
    const total = 1_000;
    await database.query(
      `INSERT INTO notes (id, user_id, title, body)
       SELECT uuidv7(), $1, 'Bulk ' || n, repeat('x', 200) FROM generate_series(1, $2) AS n`,
      [user.userId, total],
    );
    const client = await newClient(user);
    const started = performance.now();
    await client.connect();
    await vi.waitFor(async () => expect(await client.noteIds()).toHaveLength(total), {
      timeout: 60_000,
    });
    const elapsed = Math.round(performance.now() - started);
    console.info(`first sync of ${total} notes: ${elapsed} ms`);
    expect(elapsed).toBeGreaterThan(0);
  });
});
