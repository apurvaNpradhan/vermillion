import { openapi } from "@orpc/openapi";
import { REGISTRATION_MODES } from "@workspace/shared";
import { z } from "zod";

import { base } from "../platform/orpc/base";

/**
 * What the auth screens need before anyone is signed in: how sign-up works (`open`, or `invite`
 * when only invited addresses may create an account) and which social providers are configured
 * (so the clients show only the buttons that work). `open` stays for older clients.
 */
const registrationStatus = base
  .meta(
    openapi({
      tags: ["Auth"],
      method: "GET",
      path: "/auth/registration-status",
      summary: "Registration status",
      description: "How sign-up works and which social providers are configured. Public.",
    }),
  )
  .output(
    z.object({
      open: z.boolean(),
      mode: z.enum(REGISTRATION_MODES),
      providers: z.object({ google: z.boolean(), github: z.boolean() }),
    }),
  )
  .handler(({ context }) => ({
    open: context.services.config.registrationOpen,
    mode: context.services.config.registrationOpen ? ("open" as const) : ("invite" as const),
    providers: {
      google: Boolean(context.services.config.google),
      github: Boolean(context.services.config.github),
    },
  }));

export const authRouter = { registrationStatus };
