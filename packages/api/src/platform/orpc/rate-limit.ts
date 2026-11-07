import { ORPCError } from "@orpc/server";

import { authed } from "./base";

/**
 * Per-user fixed-window limit for one procedure (or a family of them). Counters
 * live in process memory; give each limited procedure its own `name`.
 */
export function rateLimit({
  name,
  windowMs,
  max,
}: {
  name: string;
  windowMs: number;
  max: number;
}) {
  return authed.middleware(async ({ context, next }) => {
    if (!context.services.rateLimiter.hit(`${name}:${context.userId}`, { windowMs, max })) {
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests" });
    }
    return next();
  });
}
