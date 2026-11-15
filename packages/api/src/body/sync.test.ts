import { uuidv7 } from "@workspace/db/columns";
import { computeOpsDigest, SYNC_SCHEMA_VERSION, type SyncOp } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createSignedInUser, type TestApp } from "../platform/testing/harness";
import { bodySyncHandler } from "./sync";
describe("body measurement uploads", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: {
        sync: {
          endpoint: "http://127.0.0.1:8090",
          slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
        },
      },
    });
  });
  afterAll(async () => app.close());
  async function writer() {
    const client = app.client(await createSignedInUser(app, `${uuidv7()}@example.com`));
    const { userId } = await client.sync.credentials();
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
      send(ops: SyncOp[]) {
        return client.sync.upload({
          userId,
          installId,
          txId: ++txId,
          schemaVersion: SYNC_SCHEMA_VERSION,
          digest: computeOpsDigest(ops),
          ops,
        });
      },
    };
  }
  const values = {
    metric: "weight",
    value: 80,
    measured_at: "2026-01-01T12:00:00Z",
    local_date: "2026-01-01",
    source: "manual",
  };
  it("refuses anonymous uploads", async () => {
    await expect(app.client().sync.credentials()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("round trips, refuses foreign edits and deletes, and explicitly restores", async () => {
    const a = await writer();
    const b = await writer();
    const id = uuidv7();
    const put: SyncOp = { op: "PUT", table: "body_measurement", id, opData: values };
    expect(await a.send([put])).toMatchObject({ status: "applied" });
    expect(await b.send([put])).toMatchObject({ status: "rejected", code: "SYNC_ID_CONFLICT" });
    expect(await b.send([{ op: "DELETE", table: put.table, id }])).toMatchObject({
      code: "SYNC_ROW_NOT_FOUND",
    });
    expect(
      await a.send([{ op: "PATCH", table: put.table, id, opData: { value: 81 } }]),
    ).toMatchObject({ status: "applied" });
    expect(await a.send([{ op: "DELETE", table: put.table, id }])).toMatchObject({
      status: "applied",
    });
    expect(
      (await app.rows(sql`SELECT deleted_at FROM body_measurement WHERE id = ${id}`))[0]
        ?.deleted_at,
    ).not.toBeNull();
    expect(await a.send([put])).toMatchObject({ code: "SYNC_ROW_DELETED" });
    expect(await a.send([{ ...put, opData: { ...values, restore: 1 } }])).toMatchObject({
      status: "applied",
    });
  });
  it("rejects unknown metrics, ranges, foreign ownership fields and dates", async () => {
    const a = await writer();
    const patches: Record<string, string | number>[] = [
      { metric: "body_fat" },
      { value: 401 },
      { value: 19 },
      { local_date: "2099-01-01" },
      { local_date: "2000-01-01" },
      { user_id: a.userId },
      { metric: "waist", value: 251 },
    ];
    for (const patch of patches) {
      expect(
        await a.send([
          { op: "PUT", table: "body_measurement", id: uuidv7(), opData: { ...values, ...patch } },
        ]),
      ).toMatchObject({ status: "rejected", code: "SYNC_INVALID_OP" });
    }
  });
  it("refuses only the bad measurement in an independently queued Check-in batch", async () => {
    const a = await writer();
    const rows = [
      { id: uuidv7(), metric: "waist", value: 80 },
      { id: uuidv7(), metric: "chest", value: 251 },
      { id: uuidv7(), metric: "left_bicep", value: 35 },
    ];
    // logMeasurements queues one transaction per row, preserving the upload protocol.
    const outcomes = [];
    for (const row of rows)
      outcomes.push(
        await a.send([
          {
            op: "PUT",
            table: "body_measurement",
            id: row.id,
            opData: { ...values, metric: row.metric, value: row.value },
          },
        ]),
      );
    expect(outcomes).toMatchObject([
      { status: "applied" },
      { status: "rejected", code: "SYNC_INVALID_OP" },
      { status: "applied" },
    ]);
    expect(
      await app.rows(
        sql`SELECT metric FROM body_measurement WHERE user_id = ${a.userId} ORDER BY metric`,
      ),
    ).toEqual([{ metric: "left_bicep" }, { metric: "waist" }]);
  });
  it("purges content atomically but keeps a marker against stale recreation", async () => {
    const a = await writer();
    const id = uuidv7();
    const put: SyncOp = { op: "PUT", table: "body_measurement", id, opData: values };
    await a.send([put]);
    await a.send([{ op: "DELETE", table: put.table, id }]);
    await app.services.db.execute(
      sql`UPDATE body_measurement SET deleted_at = now() - interval '121 days' WHERE id = ${id}`,
    );
    expect(
      await bodySyncHandler.purgeTombstones(app.services.db, new Date(Date.now() - 120 * 86400000)),
    ).toBe(1);
    expect(await app.rows(sql`SELECT value FROM body_measurement WHERE id = ${id}`)).toEqual([]);
    expect(await a.send([put])).toMatchObject({ code: "SYNC_ROW_DELETED" });
  });
});
