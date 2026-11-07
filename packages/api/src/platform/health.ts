import { Hono } from "hono";

/** Liveness probe used by container health checks. */
export const healthRoutes = new Hono().get("/health", (c) => c.json({ status: "ok" as const }));
