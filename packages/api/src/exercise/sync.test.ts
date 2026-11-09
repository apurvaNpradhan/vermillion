import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  CUSTOM_EXERCISE_LIMIT,
  SYNC_SCHEMA_VERSION,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { bundledCatalogText } from "./operations/bundled-catalog";
import { importCatalog } from "./operations/import-catalog";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

describe("exercise upload handler", () => {
  let app: TestApp;
  let catalogId: string;
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
    await importCatalog(app.services.db, bundledCatalogText());
    const [row] = await app.rows(sql`SELECT id FROM exercise WHERE user_id IS NULL LIMIT 1`);
    catalogId = String(row?.id);
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
      /** Another device of the same user. */
      another: () => installOf(client, userId),
    };
  }
  async function writer(email: string) {
    const client = app.client(await createSignedInUser(app, email));
    const { userId } = await client.sync.credentials();
    return installOf(client, userId);
  }
  type Writer = Awaited<ReturnType<typeof writer>>;

  const mine = {
    title: "  My press ",
    primary_muscle: "chest",
    secondary_muscles: '["triceps","shoulders"]',
    equipment: "dumbbell",
    exercise_type: "weight_reps",
    is_full_bodyweight: 0,
    instructions: "Push.",
  };
  const put = (id: string, opData: SyncOp["opData"] = mine): SyncOp => ({
    op: "PUT",
    table: "exercise",
    id,
    opData,
  });
  const patch = (id: string, opData: SyncOp["opData"]): SyncOp => ({
    op: "PATCH",
    table: "exercise",
    id,
    opData,
  });
  const stored = async (id: string) =>
    (
      await app.rows(
        sql`SELECT id, user_id, title, primary_muscle, equipment, exercise_type, is_full_bodyweight, rank, search_terms, aka, instructions, video_key, thumbnail_key, retired_at, to_json(secondary_muscles)::text AS muscles FROM exercise WHERE id = ${id}`,
      )
    )[0];
  const rejected = (code: SyncFailureCode): Partial<SyncUploadResult> => ({
    status: "rejected",
    code,
  });

  it("creates, edits, archives and restores the owner's exercise", async () => {
    const me: Writer = await writer("owner@example.com");
    const id = uuidv7();
    expect(await me.send([put(id)])).toEqual({ status: "applied" });
    expect(await stored(id)).toMatchObject({
      user_id: me.userId,
      title: "My press",
      primary_muscle: "chest",
      muscles: '["triceps","shoulders"]',
      is_full_bodyweight: false,
      rank: 0,
      aka: null,
      search_terms: null,
      video_key: null,
      thumbnail_key: null,
      retired_at: null,
    });

    expect(await me.send([patch(id, { title: "Better press", equipment: "barbell" })])).toEqual({
      status: "applied",
    });
    expect(await stored(id)).toMatchObject({
      title: "Better press",
      equipment: "barbell",
      // Fields that were not sent stay as they were.
      instructions: "Push.",
      muscles: '["triceps","shoulders"]',
    });

    const when = new Date().toISOString();
    expect(await me.send([patch(id, { retired_at: when })])).toEqual({ status: "applied" });
    expect((await stored(id))?.retired_at).not.toBeNull();
    expect(await me.send([patch(id, { retired_at: null })])).toEqual({ status: "applied" });
    expect((await stored(id))?.retired_at).toBeNull();

    // A PUT of an existing own row replaces its fields.
    expect(await me.send([put(id, { ...mine, title: "Replaced" })])).toEqual({ status: "applied" });
    expect((await stored(id))?.title).toBe("Replaced");
  });

  it("refuses writes to a catalog row, and deletes", async () => {
    const me = await writer("catalog@example.com");
    const before = await stored(catalogId);
    expect(await me.send([patch(catalogId, { title: "Hacked" })])).toMatchObject(
      rejected("EXERCISE_CATALOG_READ_ONLY"),
    );
    expect(await me.send([put(catalogId)])).toMatchObject(rejected("EXERCISE_CATALOG_READ_ONLY"));
    expect(await me.send([{ op: "DELETE", table: "exercise", id: catalogId }])).toMatchObject(
      rejected("EXERCISE_DELETE_NOT_ALLOWED"),
    );
    expect(await stored(catalogId)).toEqual(before);

    const own = uuidv7();
    await me.send([put(own)]);
    expect(await me.send([{ op: "DELETE", table: "exercise", id: own }])).toMatchObject(
      rejected("EXERCISE_DELETE_NOT_ALLOWED"),
    );
    expect(await stored(own)).toBeDefined();
  });

  it("refuses another user's exercise without changing it", async () => {
    const [alice, bob] = [await writer("alice@example.com"), await writer("bob@example.com")];
    const id = uuidv7();
    await alice.send([put(id)]);

    expect(await bob.send([patch(id, { title: "Stolen" })])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await bob.send([put(id, { ...mine, title: "Stolen" })])).toMatchObject(
      rejected("SYNC_ID_CONFLICT"),
    );
    expect(await stored(id)).toMatchObject({ user_id: alice.userId, title: "My press" });
  });

  it("refuses server-owned columns and invalid data", async () => {
    const me = await writer("invalid@example.com");
    const invalid = async (opData: SyncOp["opData"], id = uuidv7()) =>
      expect(await me.send([put(id, opData)])).toMatchObject(rejected("SYNC_INVALID_OP"));

    await invalid({ ...mine, rank: 10 });
    await invalid({ ...mine, aka: "x" });
    await invalid({ ...mine, video_key: "a.mp4" });
    await invalid({ ...mine, search_terms: "x" });
    await invalid({ ...mine, user_id: "someone-else" });
    await invalid({ ...mine, title: "   " });
    await invalid({ ...mine, title: "a".repeat(101) });
    await invalid({ ...mine, instructions: "x".repeat(2001) });
    await invalid({ ...mine, equipment: "cable" });
    await invalid({ ...mine, secondary_muscles: '["chest"]' });
    await invalid({ ...mine, secondary_muscles: '["triceps","triceps"]' });
    await invalid({ ...mine, secondary_muscles: "not json" });
    await invalid(mine, uuidv7().replace(/^(.{14})7/, "$14")); // not a UUIDv7

    const id = uuidv7();
    await me.send([put(id)]);
    expect(await me.send([patch(id, { rank: 5 })])).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(await me.send([patch(id, { secondary_muscles: '["chest"]' })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect((await stored(id))?.rank).toBe(0);
    expect(await me.send([patch(uuidv7(), { title: "x" })])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
  });

  it("accepts a title of exactly 100 characters, from a create and a rename", async () => {
    const me = await writer("limit-title@example.com");
    const id = uuidv7();
    const longest = "a".repeat(100);
    expect(await me.send([put(id, { ...mine, title: longest })])).toEqual({ status: "applied" });
    expect((await stored(id))?.title).toBe(longest);
    const renamed = "b".repeat(100);
    expect(await me.send([patch(id, { title: renamed })])).toEqual({ status: "applied" });
    expect((await stored(id))?.title).toBe(renamed);
  });

  it("limits live Custom exercises, not archived ones, and excludes the row being written", async () => {
    const me = await writer("limit@example.com");
    await app.services.db.execute(sql`
      INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type, retired_at)
      SELECT gen_random_uuid(), ${me.userId}, 'Filler ' || n, 'chest', 'none', 'reps_only',
             CASE WHEN n <= 5 THEN now() END
        FROM generate_series(1, ${CUSTOM_EXERCISE_LIMIT + 5}) AS n`);
    // 1,000 live and 5 archived.
    const extra = uuidv7();
    expect(await me.send([put(extra)])).toMatchObject(rejected("EXERCISE_LIMIT_REACHED"));

    const [archived] = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id = ${me.userId} AND retired_at IS NOT NULL LIMIT 1`,
    );
    expect(await me.send([patch(String(archived?.id), { retired_at: null })])).toMatchObject(
      rejected("EXERCISE_LIMIT_REACHED"),
    );

    // Editing a live exercise at the limit is fine: the row itself is not counted against it.
    const [live] = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id = ${me.userId} AND retired_at IS NULL LIMIT 1`,
    );
    expect(await me.send([patch(String(live?.id), { title: "Renamed at limit" })])).toEqual({
      status: "applied",
    });
    expect(await me.send([put(String(live?.id), { ...mine, title: "Replaced at limit" })])).toEqual(
      { status: "applied" },
    );

    // Archiving frees a slot.
    expect(
      await me.send([patch(String(live?.id), { retired_at: new Date().toISOString() })]),
    ).toEqual({ status: "applied" });
    expect(await me.send([put(extra)])).toEqual({ status: "applied" });
  });

  /** Holds the user's exercise lock in an open transaction until `release` is called. */
  async function holdUserLock(userId: string) {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (locked = resolve));
    const done = app.services.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`exercise:${userId}`}, 0))`,
      );
      locked();
      await gate;
    });
    await ready;
    return async () => {
      release();
      await done;
    };
  }
  /** Waits until `n` sessions are blocked on an advisory lock (or gives up after two seconds). */
  async function waitForBlocked(n: number) {
    for (let i = 0; i < 40; i += 1) {
      const [row] = await app.rows(
        sql`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
      );
      if (Number(row?.n) >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  it("serialises concurrent edits so the secondary muscles never include the primary", async () => {
    const a = await writer("race-muscles@example.com");
    const b = a.another();
    const id = uuidv7();
    await a.send([
      put(id, { ...mine, primary_muscle: "shoulders", secondary_muscles: '["triceps"]' }),
    ]);
    const release = await holdUserLock(a.userId);
    // Each edit is valid against the stored row alone; together they are not.
    const results = Promise.all([
      a.send([patch(id, { primary_muscle: "chest" })]),
      b.send([patch(id, { secondary_muscles: '["chest"]' })]),
    ]);
    await waitForBlocked(2);
    await release();
    const [first, second] = await results;
    expect([first.status, second.status].sort()).toEqual(["applied", "rejected"]);
    const row = await stored(id);
    expect(JSON.parse(String(row?.muscles))).not.toContain(row?.primary_muscle);
  });

  it("keeps the live limit when restores and creates race", async () => {
    const a = await writer("race-limit@example.com");
    await app.services.db.execute(sql`
      INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type, retired_at)
      SELECT gen_random_uuid(), ${a.userId}, 'Filler ' || n, 'chest', 'none', 'reps_only',
             CASE WHEN n = ${CUSTOM_EXERCISE_LIMIT} THEN now() END
        FROM generate_series(1, ${CUSTOM_EXERCISE_LIMIT}) AS n`);
    const archived = await app.rows(
      sql`SELECT id FROM exercise WHERE user_id = ${a.userId} AND retired_at IS NOT NULL`,
    );
    const release = await holdUserLock(a.userId);
    const results = Promise.all([
      a.send([patch(String(archived[0]?.id), { retired_at: null })]),
      a.another().send([put(uuidv7())]),
    ]);
    await waitForBlocked(2);
    await release();
    const settled = (await results).map((result) => result.status);
    expect(settled.filter((status) => status === "applied")).toHaveLength(1);
    const [live] = await app.rows(
      sql`SELECT count(*)::int AS n FROM exercise WHERE user_id = ${a.userId} AND retired_at IS NULL`,
    );
    expect(live?.n).toBe(CUSTOM_EXERCISE_LIMIT);
  });

  it("allows changing the type while no set references the exercise", async () => {
    // The training slice makes `exerciseTypeLocked` look at sets; with none, every change is allowed.
    const me = await writer("type@example.com");
    const id = uuidv7();
    await me.send([put(id)]);
    expect(await me.send([patch(id, { exercise_type: "duration" })])).toEqual({
      status: "applied",
    });
    expect((await stored(id))?.exercise_type).toBe("duration");
  });
});
