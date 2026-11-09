import { column, Schema, Table } from "@powersync/common";
import { SYNC_SCHEMA_VERSION } from "@workspace/shared";
import {
  DEFAULT_LIBRARY_FILTERS,
  libraryQuery,
  powerSyncSchema,
  type LibraryFilters,
} from "@workspace/sync";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { useSyncSuite, within } from "./support/suite";
import { createUser, database, serverExercise } from "./support/users";

// Seam 3, phase 7: client/server compatibility (ADR 0018/0019) and local read performance.

const newClient = useSyncSuite();

describe("old clients", () => {
  it("pauses a client outside the schema window, keeps every write and resumes after the update", async () => {
    const user = await createUser();
    const client = await newClient(user, { schemaVersion: SYNC_SCHEMA_VERSION + 1 });
    await client.connect();
    const [first, second] = [uuidv7(), uuidv7()];
    await client.createExercise(first, user.userId, "Kept one", "1");
    await client.createExercise(second, user.userId, "Kept two", "2");

    // The server refuses (not a verdict on the writes); the connector keeps retrying.
    await vi.waitFor(() => {
      const refusals = client.records.filter(
        (r) => r.kind === "error" && r.code === "SYNC_CLIENT_INCOMPATIBLE",
      );
      expect(refusals.length).toBeGreaterThanOrEqual(2);
    }, within);
    expect(client.outcomes().size).toBe(0);
    expect(await client.queued()).toBe(2);
    expect(await serverExercise(first)).toBeUndefined();
    expect(await serverExercise(second)).toBeUndefined();
    expect(await client.customIds()).toHaveLength(2); // the writes are still on the device

    // "Update the app": the client now speaks a supported version; the same queue drains.
    client.transport.schemaVersion = SYNC_SCHEMA_VERSION;
    await client.uploaded();
    expect([...client.outcomes().values()].map((o) => o.status)).toEqual(["applied", "applied"]);
    expect(await serverExercise(first)).toMatchObject({ title: "Kept one", instructions: "1" });
    expect(await serverExercise(second)).toMatchObject({ title: "Kept two", instructions: "2" });
  });

  it("applies writes queued by a client from before a column existed, defaults included", async () => {
    const user = await createUser();
    // The old build's table knows the required columns only: no instructions, no timestamps.
    const oldSchema = new Schema({
      exercise: new Table({
        user_id: column.text,
        title: column.text,
        primary_muscle: column.text,
        equipment: column.text,
        exercise_type: column.text,
      }),
    });
    const old = await newClient(user, {}, oldSchema);
    const current = await newClient(user);
    await Promise.all([old.connect(), current.connect()]);
    await old.disconnect();

    const id = uuidv7();
    await old.database.execute(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type)
       VALUES (?, ?, ?, 'chest', 'dumbbell', 'weight_reps')`,
      [id, user.userId, "From the past"],
    );
    await old.database.execute("UPDATE exercise SET title = ? WHERE id = ?", [
      "Edited in the past",
      id,
    ]);
    await old.connect();
    await old.uploaded();

    expect([...old.outcomes().values()].map((o) => o.status)).toEqual(["applied", "applied"]);
    // The omitted columns took the server defaults; the new device sees a complete row.
    expect(await serverExercise(id)).toMatchObject({
      title: "Edited in the past",
      instructions: null,
      secondary_muscles: [],
    });
    await vi.waitFor(
      async () => expect(await current.exercise(id)).toMatchObject({ title: "Edited in the past" }),
      within,
    );
    // The stream carries columns the old build does not know; it ignores them and keeps working.
    const newer = uuidv7();
    await current.createExercise(newer, user.userId, "Newer", "with instructions");
    await vi.waitFor(async () => expect(await old.customIds()).toContain(newer), within);
  });

  it("answers a write that a newer validator no longer accepts with a recorded rejection", async () => {
    const user = await createUser();
    const client = await newClient(user);
    await client.connect();
    await client.disconnect();
    const stale = uuidv7();
    // An older build allowed an empty title; today's validator refuses it.
    await client.createExercise(stale, user.userId, "");
    await client.connect();
    await client.uploaded();
    expect([...client.outcomes().values()]).toEqual([
      expect.objectContaining({ status: "rejected", code: "SYNC_INVALID_OP" }),
    ]);
    expect(await serverExercise(stale)).toBeUndefined();
  });
});

describe("local reads", () => {
  it("serves the library list from the local indexes, not a table scan", async () => {
    const user = await createUser();
    const client = await newClient(user, {}, powerSyncSchema);
    await client.database.writeTransaction(async (tx) => {
      for (let n = 0; n < 1_000; n++) {
        await tx.execute(
          `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
             exercise_type, is_full_bodyweight, rank, created_at)
           VALUES (?, ?, ?, 'chest', '[]', 'dumbbell', 'weight_reps', 0, 0, ?)`,
          [uuidv7(), user.userId, `Exercise ${n}`, new Date(n * 1000).toISOString()],
        );
      }
    });
    // Each filter the library offers must start from a local index, never a scan of all rows. The
    // list is sorted by title (case-insensitive) in memory: with at most a few thousand rows that
    // is the accepted cost, and `LIMIT` bounds what is returned.
    const filterSets: LibraryFilters[] = [
      DEFAULT_LIBRARY_FILTERS,
      { ...DEFAULT_LIBRARY_FILTERS, muscles: ["chest"] },
      { ...DEFAULT_LIBRARY_FILTERS, equipment: ["dumbbell"] },
    ];
    for (const filters of filterSets) {
      const query = libraryQuery(filters, 100 + 1);
      const plan = await client.database.getAll<{ detail: string }>(
        `EXPLAIN QUERY PLAN ${query.sql}`,
        query.params,
      );
      const details = plan.map((row) => row.detail).join("\n");
      expect(details).toMatch(/SEARCH ps_data__exercise USING INDEX ps_data__exercise__exercise_/);
      expect(details).not.toMatch(/SCAN exercise\b|SCAN ps_data__exercise\b/);
    }
  });
});

describe("first sync", () => {
  it("downloads a thousand Custom exercises into an empty device (measurement, not a gate)", async () => {
    const user = await createUser();
    const total = 1_000;
    await database.query(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type,
         instructions)
       SELECT uuidv7(), $1, 'Bulk ' || n, 'chest', 'dumbbell', 'weight_reps', repeat('x', 200)
         FROM generate_series(1, $2) AS n`,
      [user.userId, total],
    );
    const client = await newClient(user);
    const started = performance.now();
    await client.connect();
    await vi.waitFor(async () => expect(await client.customIds()).toHaveLength(total), {
      timeout: 60_000,
    });
    const elapsed = Math.round(performance.now() - started);
    console.info(`first sync of ${total} custom exercises: ${elapsed} ms`);
    expect(elapsed).toBeGreaterThan(0);
  });
});
