import { ORPCError } from "@orpc/server";
import type { Transaction } from "@workspace/db";
import { session as sessionTable, user as userTable } from "@workspace/db/schema/auth";
import {
  assertAuditDetail,
  CLIENT_IP_HEADER,
  TWO_FACTOR_REQUIRED,
  type AuditEntry,
} from "@workspace/shared";
import { isAdminEmail } from "@workspace/auth";
import { eq } from "drizzle-orm";

import { authed } from "../platform/orpc/base";
import { adminAudit } from "./tables";

/** Answers like a route that does not exist, so the admin's existence leaks nothing. */
const notFound = () => new ORPCError("NOT_FOUND", { message: "Not found" });

/**
 * Admin-area procedures that only need the role and the allowlist: the two-factor enrolment
 * status. Everything else uses `admin`. The role is re-read from the database (not trusted from
 * the session) and the address must still be in `ADMIN_EMAILS`; either failure is NOT_FOUND.
 */
export const adminEnrolment = authed.use(async ({ context, next }) => {
  const [account] = await context.services.db
    .select()
    .from(userTable)
    .where(eq(userTable.id, context.userId))
    .limit(1);
  if (
    !account ||
    account.role !== "admin" ||
    !isAdminEmail(account.email, account.emailVerified, context.services.config.adminEmails) ||
    account.banned
  ) {
    throw notFound();
  }
  const [current] = await context.services.db
    .select({ verifiedAt: sessionTable.twoFactorVerifiedAt })
    .from(sessionTable)
    .where(eq(sessionTable.id, context.session.id))
    .limit(1);
  return next({
    context: {
      admin: {
        id: account.id,
        email: account.email,
        twoFactorEnabled: account.twoFactorEnabled === true,
        sessionVerified: Boolean(current?.verifiedAt),
      },
    },
  });
});

/** Runs `work` and records its audit row in the same transaction. */
export type Audited = <Result>(
  work: (tx: Transaction) => Promise<Result>,
  entry: (result: Result) => AuditEntry,
) => Promise<Result>;

/**
 * The builder of every admin procedure. In order: a session (`authed`), the `admin` role re-read
 * from the database, the address still in `ADMIN_EMAILS` (both NOT_FOUND), then two-factor
 * enabled and this session past the authenticator step (FORBIDDEN with `TWO_FACTOR_REQUIRED`,
 * so the site routes to enrolment or the code). A write goes through `context.audited`, which
 * commits the change and its `admin_audit` row together.
 */
export const admin = adminEnrolment.use(async ({ context, next }) => {
  if (!context.admin.twoFactorEnabled || !context.admin.sessionVerified) {
    throw new ORPCError("FORBIDDEN", {
      message: "The authenticator step is required",
      data: { code: TWO_FACTOR_REQUIRED, enrolled: context.admin.twoFactorEnabled },
    });
  }
  const ip = context.headers.get(CLIENT_IP_HEADER);
  const userAgent = context.headers.get("user-agent")?.slice(0, 512) ?? null;
  const audited: Audited = (work, entry) =>
    context.services.db.transaction(async (tx) => {
      const result = await work(tx);
      const record = entry(result);
      assertAuditDetail(record);
      await tx.insert(adminAudit).values({
        actorUserId: context.userId,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        detail: record.detail,
        ip,
        userAgent,
      });
      return result;
    });
  return next({ context: { audited } });
});
