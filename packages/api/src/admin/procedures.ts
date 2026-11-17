import { openapi } from "@orpc/openapi";
import { auditActionSchema, auditTargetTypeSchema, latestReleaseSchema } from "@workspace/shared";
import { z } from "zod";

import { admin, adminEnrolment } from "./builder";
import { listAudit } from "./operations/list-audit";
import { adminOverview } from "./operations/overview";
import { adminUsersRouter } from "./users/procedures";

const adminApi = admin.meta(openapi({ tags: ["Admin"] }));

/**
 * Where the signed-in admin stands with the second step; the site routes on it. Needs only the
 * role and the allowlist (enrolment happens before the step exists).
 */
const status = adminEnrolment
  .meta(
    openapi({
      tags: ["Admin"],
      method: "GET",
      path: "/admin/enrolment",
      summary: "Admin two-factor status",
      description: "Answers 404 for everyone who is not an allow-listed admin.",
    }),
  )
  .output(
    z.object({
      email: z.string(),
      twoFactorEnabled: z.boolean(),
      sessionVerified: z.boolean(),
    }),
  )
  .handler(({ context }) => ({
    email: context.admin.email,
    twoFactorEnabled: context.admin.twoFactorEnabled,
    sessionVerified: context.admin.sessionVerified,
  }));

const overview = adminApi
  .meta(openapi({ method: "GET", path: "/admin/overview", summary: "Admin overview counts" }))
  .output(
    z.object({
      accounts: z.number().int(),
      pendingRequests: z.number().int(),
      catalog: z.object({ live: z.number().int(), retired: z.number().int() }),
      latestRelease: latestReleaseSchema.nullable(),
      minimumVersion: z.string().nullable(),
    }),
  )
  .handler(({ context }) => adminOverview(context.services));

const auditList = adminApi
  .meta(openapi({ method: "GET", path: "/admin/audit", summary: "The record of admin writes" }))
  .input(
    z.object({
      action: auditActionSchema.optional(),
      targetType: auditTargetTypeSchema.optional(),
      targetId: z.string().max(64).optional(),
      page: z.number().int().min(1).max(100_000).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  )
  .output(
    z.object({
      entries: z.array(
        z.object({
          id: z.string(),
          actorUserId: z.string(),
          actorEmail: z.string().nullable(),
          action: z.string(),
          targetType: z.string(),
          targetId: z.string(),
          detail: z.record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
          ),
          ip: z.string().nullable(),
          userAgent: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
      total: z.number().int(),
    }),
  )
  .handler(({ context, input }) => listAudit(context.services.db, input));

/** The admin procedures this vertical owns; the router adds catalog, access and releases. */
export const adminRouter = {
  enrolment: { status },
  overview,
  audit: { list: auditList },
  users: adminUsersRouter,
};
