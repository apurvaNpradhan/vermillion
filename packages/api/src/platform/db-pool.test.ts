import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./testing/harness";
import { connectAdmin } from "./testing/postgres";

// A Postgres restart or failover kills idle pooled connections. The server must survive it
// (an unhandled pool 'error' event used to take the process down) and serve the next query.
describe("database pool", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it("survives the termination of its idle connections", async () => {
    // Open several pooled connections, then let them go idle.
    await Promise.all(Array.from({ length: 3 }, () => app.rows(sql`SELECT pg_sleep(0.05)`)));
    const named = await app.rows(sql`SELECT current_database() AS name`);
    const admin = await connectAdmin();
    try {
      const killed = await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = $1 AND backend_type = 'client backend' AND pid <> pg_backend_pid()`,
        [named[0]?.name],
      );
      expect(killed.rowCount).toBeGreaterThan(0);
    } finally {
      await admin.end();
    }
    // No uncaught exception (vitest fails the run on one) and the pool reconnects.
    const rows = await app.rows(sql`SELECT 1 AS ok`);
    expect(rows[0]?.ok).toBe(1);
  });
});
