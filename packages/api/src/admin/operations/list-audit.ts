import type { Database } from "@workspace/db";
import type { AuditAction, AuditTargetType } from "@workspace/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { user } from "@workspace/db/schema/auth";

import { adminAudit } from "../tables";

export type ListAuditInput = {
  action?: AuditAction | undefined;
  targetType?: AuditTargetType | undefined;
  targetId?: string | undefined;
  page: number;
  limit: number;
};

/** One page of the record, newest first, with the actor's address when the account still exists. */
export async function listAudit(db: Database, input: ListAuditInput) {
  const filters: SQL[] = [];
  if (input.action) filters.push(eq(adminAudit.action, input.action));
  if (input.targetType) filters.push(eq(adminAudit.targetType, input.targetType));
  if (input.targetId) filters.push(eq(adminAudit.targetId, input.targetId));
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: adminAudit.id,
        actorUserId: adminAudit.actorUserId,
        actorEmail: user.email,
        action: adminAudit.action,
        targetType: adminAudit.targetType,
        targetId: adminAudit.targetId,
        detail: adminAudit.detail,
        ip: adminAudit.ip,
        userAgent: adminAudit.userAgent,
        createdAt: adminAudit.createdAt,
      })
      .from(adminAudit)
      .leftJoin(user, eq(user.id, adminAudit.actorUserId))
      .where(where)
      .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAudit)
      .where(where),
  ]);
  return {
    entries: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total: total?.count ?? 0,
  };
}
