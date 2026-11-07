import { Hono } from "hono";

import type { Services } from "../platform/services";

/** Better Auth's HTTP API under /api/auth: sign-in, sign-up, verification, sessions. */
export function authRoutes(services: Services) {
  return new Hono().on(["POST", "GET"], "/auth/*", (c) => services.auth.handler(c.req.raw));
}
