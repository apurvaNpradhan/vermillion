// Reads a real logical slot on the compose Postgres. See bootstrap.infra.test.ts.
import { randomBytes } from "node:crypto";
import { createDb } from "@workspace/db";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { classifySlots, readReplicationSlots, thresholdsFromMegabytes } from "./slot-lag";

const URL_ =
  process.env.SYNC_INFRA_TEST_ADMIN_URL ?? "postgresql://postgres:password@localhost:5432/postgres";

const probe = new Client({ connectionString: URL_, connectionTimeoutMillis: 2_000 });
const unavailable = await probe
  .connect()
  .then(async () => {
    const { rows } = await probe.query<{ wal_level: string }>(
      "SELECT current_setting('wal_level') AS wal_level",
    );
    return rows[0]?.wal_level === "logical" ? undefined : "wal_level is not logical";
  })
  .catch(() => "no Postgres reachable");
if (unavailable) process.stderr.write(`\nSKIPPED slot-lag infra tests: ${unavailable}\n`);

const slot = `powersync_infra_${randomBytes(4).toString("hex")}`;
const { db, pool } = createDb(URL_);

afterAll(async () => {
  if (!unavailable) {
    await probe.query("SELECT pg_drop_replication_slot($1)", [slot]).catch(() => undefined);
  }
  await probe.end().catch(() => undefined);
  await pool.end();
});

describe.skipIf(unavailable)("slot lag against a real logical slot", () => {
  it("sees a new PowerSync slot, with lag that grows as WAL is written", async () => {
    await probe.query("SELECT pg_create_logical_replication_slot($1, 'pgoutput')", [slot]);
    const thresholds = thresholdsFromMegabytes(1024, 3072);

    const first = (await readReplicationSlots(db)).find((row) => row.slot_name === slot);
    expect(first).toMatchObject({
      active: false,
      wal_status: "reserved",
      invalidation_reason: null,
    });
    expect(first?.lag_bytes).toBeGreaterThanOrEqual(0);

    await probe.query("SELECT pg_logical_emit_message(true, 'infra', repeat('x', 100000))");
    const second = (await readReplicationSlots(db)).find((row) => row.slot_name === slot);
    expect(second?.lag_bytes ?? 0).toBeGreaterThan(first?.lag_bytes ?? 0);

    const report = classifySlots(second ? [second] : [], thresholds);
    expect(report.status).toBe("ok");
  });

  it("ignores slots that are not PowerSync's", async () => {
    const other = `other_infra_${randomBytes(4).toString("hex")}`;
    await probe.query("SELECT pg_create_logical_replication_slot($1, 'pgoutput')", [other]);
    try {
      const names = (await readReplicationSlots(db)).map((row) => row.slot_name);
      expect(names).not.toContain(other);
    } finally {
      await probe.query("SELECT pg_drop_replication_slot($1)", [other]);
    }
  });
});
