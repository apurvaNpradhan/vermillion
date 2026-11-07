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
 *
 * The route is unauthenticated, so the body is the status only; slot names, lag
 * and WAL state go to the logs. It fails closed: a database or slot view that
 * cannot be read is `unavailable`, and a critical slot is `degraded`, both 503.
 */
export function readinessRoutes({ db, config }: Pick<Services, "db" | "config">) {
  return new Hono().get("/ready", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      return c.json({ status: "unavailable" as const }, 503);
    }
    try {
      const replication = classifySlots(await readReplicationSlots(db), config.sync.slotLag);
      if (replication.status === "critical") {
        log.warn({ action: "sync.readiness", status: "degraded", slots: replication.slots.length });
        return c.json({ status: "degraded" as const }, 503);
      }
      return c.json({ status: "ok" as const });
    } catch {
      log.error({ action: "sync.readiness", message: "Replication slots unreadable" });
      return c.json({ status: "unavailable" as const }, 503);
    }
  });
}
