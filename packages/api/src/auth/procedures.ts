import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { base } from "../platform/orpc/base";

/**
 * What the auth screens need before anyone is signed in: whether sign-up is
 * open and which social providers are configured (so the clients show only
 * the buttons that work).
 */
const registrationStatus = base
  .meta(
    openapi({
      tags: ["Auth"],
      method: "GET",
      path: "/auth/registration-status",
      summary: "Registration status",
      description: "Whether sign-up is open and which social providers are configured. Public.",
    }),
  )
  .output(
    z.object({
      open: z.boolean(),
      providers: z.object({ google: z.boolean(), github: z.boolean() }),
    }),
  )
  .handler(({ context }) => ({
    open: context.services.config.registrationOpen,
    providers: {
      google: Boolean(context.services.config.google),
      github: Boolean(context.services.config.github),
    },
  }));

export const authRouter = { registrationStatus };
