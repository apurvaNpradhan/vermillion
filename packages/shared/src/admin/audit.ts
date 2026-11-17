import { z } from "zod";

import { STORED_INVITE_STATES } from "./invites";

/**
 * The record of admin writes (`admin_audit`). Every action has a dotted slug and a small detail
 * object, validated here so the server and the admin site agree on both.
 */
const empty = z.strictObject({});
const changedFields = z.strictObject({ fields: z.array(z.string().max(64)).max(32) });

export const AUDIT_DETAIL_SCHEMAS = {
  "catalog.create": z.strictObject({ title: z.string().max(200), retired: z.boolean() }),
  "catalog.update": changedFields,
  "catalog.retire": empty,
  "catalog.restore": empty,
  "user.ban": z.strictObject({ reason: z.string().max(500) }),
  "user.unban": empty,
  "user.revoke_sessions": z.strictObject({ count: z.number().int().min(0) }),
  "user.delete": empty,
  "access.approve": empty,
  "access.invite": empty,
  "access.resend": empty,
  "access.revoke": z.strictObject({ from: z.enum(STORED_INVITE_STATES) }),
  "release.set_minimum": z.strictObject({ from: z.string().nullable(), to: z.string() }),
} as const;

export type AuditAction = keyof typeof AUDIT_DETAIL_SCHEMAS;
// SAFETY: the keys of a const object literal are exactly its key type, and it is not empty.
export const AUDIT_ACTIONS = Object.keys(AUDIT_DETAIL_SCHEMAS) as [AuditAction, ...AuditAction[]];
export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export const AUDIT_TARGET_TYPES = ["exercise", "user", "invite", "setting"] as const;
export const auditTargetTypeSchema = z.enum(AUDIT_TARGET_TYPES);
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>;

export type AuditDetail<Action extends AuditAction> = z.infer<
  (typeof AUDIT_DETAIL_SCHEMAS)[Action]
>;

/** One entry as an admin procedure records it. */
export type AuditEntry<Action extends AuditAction = AuditAction> = {
  action: Action;
  targetType: AuditTargetType;
  targetId: string;
  detail: AuditDetail<Action>;
};

/** Validates an entry's detail against its action; throws on a mismatch (a programming error). */
export function assertAuditDetail(entry: AuditEntry): void {
  AUDIT_DETAIL_SCHEMAS[entry.action].parse(entry.detail);
}

/** The detail code an admin procedure answers with when the second step is missing. */
export const TWO_FACTOR_REQUIRED = "TWO_FACTOR_REQUIRED";
