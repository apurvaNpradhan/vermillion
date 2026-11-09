import { uuidv7 } from "@workspace/db/columns";
import { computeOpsDigest, SYNC_SCHEMA_VERSION, type SyncOp } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { bundledCatalogText } from "./operations/bundled-catalog";
import { CatalogImportError, importCatalog } from "./operations/import-catalog";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function freshApp() {
  app = await createTestApp(syncOptions);
  return app;
}

const file = () => JSON.parse(bundledCatalogText());
const text = (list: unknown[]) => JSON.stringify(list);
const catalogCount = async (a: TestApp, where = sql`true`) => {
  const [row] = await a.rows(
    sql`SELECT count(*)::int AS n FROM exercise WHERE user_id IS NULL AND ${where}`,
  );
  return row?.n;
};

describe("catalog import", () => {
  it("inserts every row on a fresh database and logs counts", async () => {
    const a = await freshApp();
    const result = await importCatalog(a.services.db, bundledCatalogText());
    expect(result).toEqual({
      skipped: false,
      inserted: 455,
      updated: 0,
      retired: 0,
      restored: 0,
      unchanged: 0,
    });
    expect(await catalogCount(a)).toBe(455);
    // Four rows ship retired; the rest are live.
    expect(await catalogCount(a, sql`retired_at IS NOT NULL`)).toBe(4);
  });

  it("skips an unchanged file by fingerprint, and a forced rerun writes nothing", async () => {
    const a = await freshApp();
    await importCatalog(a.services.db, bundledCatalogText());
    const [before] = await a.rows(
      sql`SELECT max(updated_at) AS at, count(*)::int AS n FROM exercise`,
    );

    expect(await importCatalog(a.services.db, bundledCatalogText())).toMatchObject({
      skipped: true,
      inserted: 0,
    });
    const forced = await importCatalog(a.services.db, bundledCatalogText(), true);
    expect(forced).toEqual({
      skipped: false,
      inserted: 0,
      updated: 0,
      retired: 0,
      restored: 0,
      unchanged: 455,
    });
    const [after] = await a.rows(
      sql`SELECT max(updated_at) AS at, count(*)::int AS n FROM exercise`,
    );
    expect(after).toEqual(before);
  });

  it("imports a catalog where two exercises swap titles", async () => {
    const a = await freshApp();
    await importCatalog(a.services.db, bundledCatalogText());
    const list = file();
    [list[3].title, list[4].title] = [list[4].title, list[3].title];
    const result = await importCatalog(a.services.db, text(list));
    expect(result).toMatchObject({ updated: 2, unchanged: 453 });
    const rows = await a.rows(
      sql`SELECT id, title FROM exercise WHERE id IN (${list[3].id}, ${list[4].id}) ORDER BY id`,
    );
    const expected = [list[3], list[4]]
      .map((row) => ({ id: row.id, title: row.title }))
      .sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(rows).toEqual(expected);
    // Only the two swapped rows were rewritten.
    const touched = await a.rows(
      sql`SELECT count(*)::int AS n FROM exercise WHERE updated_at > created_at + interval '1 millisecond'`,
    );
    expect(touched[0]?.n).toBe(2);
  });

  it("updates only the row that changed", async () => {
    const a = await freshApp();
    await importCatalog(a.services.db, bundledCatalogText());
    const list = file();
    list[10].title = "Renamed exercise";
    const result = await importCatalog(a.services.db, text(list));
    expect(result).toMatchObject({
      inserted: 0,
      updated: 1,
      retired: 0,
      restored: 0,
      unchanged: 454,
    });
    const touched = await a.rows(
      sql`SELECT id, title FROM exercise WHERE updated_at > created_at + interval '1 millisecond'`,
    );
    expect(touched).toEqual([{ id: list[10].id, title: "Renamed exercise" }]);
  });

  it("retires a row that leaves the file and restores it when it returns", async () => {
    const a = await freshApp();
    await importCatalog(a.services.db, bundledCatalogText());
    const list = file();
    const [gone] = list.splice(
      list.findIndex((row: { retired: boolean }) => !row.retired),
      1,
    );

    expect(await importCatalog(a.services.db, text(list))).toMatchObject({
      retired: 1,
      inserted: 0,
      updated: 0,
    });
    const [retired] = await a.rows(sql`SELECT retired_at FROM exercise WHERE id = ${gone.id}`);
    expect(retired?.retired_at).not.toBeNull();

    const back = await importCatalog(a.services.db, bundledCatalogText());
    expect(back).toMatchObject({ restored: 1, retired: 0, inserted: 0, updated: 0 });
    const [restored] = await a.rows(sql`SELECT retired_at FROM exercise WHERE id = ${gone.id}`);
    expect(restored?.retired_at).toBeNull();
    // Nothing was deleted along the way.
    expect(await catalogCount(a)).toBe(455);
  });

  it("refuses an id that belongs to a Custom exercise, and writes nothing", async () => {
    const a = await freshApp();
    const headers = await createSignedInUser(a, "owner@example.com");
    const client = a.client(headers);
    const { userId } = await client.sync.credentials();
    const clashing = uuidv7();
    const ops: SyncOp[] = [
      {
        op: "PUT",
        table: "exercise",
        id: clashing,
        opData: {
          title: "Mine",
          primary_muscle: "chest",
          equipment: "none",
          exercise_type: "reps_only",
        },
      },
    ];
    await client.sync.upload({
      userId,
      installId: uuidv7(),
      txId: 1,
      schemaVersion: SYNC_SCHEMA_VERSION,
      digest: computeOpsDigest(ops),
      ops,
    });

    const list = file();
    list[0].id = clashing;
    await expect(importCatalog(a.services.db, text(list))).rejects.toBeInstanceOf(
      CatalogImportError,
    );
    expect(await catalogCount(a)).toBe(0);
    const [mine] = await a.rows(sql`SELECT title, user_id FROM exercise WHERE id = ${clashing}`);
    expect(mine).toEqual({ title: "Mine", user_id: userId });
  });
});
