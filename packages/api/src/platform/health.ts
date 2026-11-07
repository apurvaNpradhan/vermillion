import { log } from "@workspace/logger";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { classifySlots, readReplicationSlots } from "./sync/slot-lag";
import type { Services } from "./services";

/** Liveness probe used by container health checks: the process answers, nothing more. */
export const healthRoutes = new Hono().get("/health", (c) => c.json({ status: "ok" as const }));

/**
 * Readiness: the dependencies the app needs are in a state worth serving from.
 * Kept apart from liveness so a lagging replication slot is reported without
 * the platform restarting a healthy container (a restart does not drain WAL).
 * 503 means degraded or unavailable; the body says which.
 */
export function readinessRoutes({ db, config }: Pick<Services, "db" | "config">) {
  return new Hono().get("/ready", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      return c.json({ status: "unavailable" as const, database: "unreachable" as const }, 503);
    }
    try {
      const replication = classifySlots(await readReplicationSlots(db), config.sync.slotLag);
      const degraded = replication.status === "critical";
      return c.json(
        { status: degraded ? ("degraded" as const) : ("ok" as const), replication },
        degraded ? 503 : 200,
      );
    } catch {
      // The slot view is unreadable (permissions, standby). Say so, but do not fail the app over it.
      log.warn({ action: "sync.readiness", message: "Replication slots unreadable" });
      return c.json({ status: "ok" as const, replication: { status: "unknown" as const } });
    }
  });
}
