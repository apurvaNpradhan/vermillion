import { createdAt, id } from "@workspace/db/columns";
import type { AuditTargetType } from "@workspace/shared";
import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Append-only record of admin writes. The action is free text validated in code against the
 * vocabulary in `@workspace/shared` (a new action needs no migration); the detail is a small
 * object validated per action. Nothing updates or deletes a row. The actor is not a foreign key:
 * the record outlives the account that wrote it.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: id(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").$type<AuditTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, string | number | boolean | null | string[]>>()
      .notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (table) => [
    index("admin_audit_created_idx").on(table.createdAt),
    index("admin_audit_target_idx").on(table.targetType, table.targetId),
    index("admin_audit_action_idx").on(table.action),
  ],
);
