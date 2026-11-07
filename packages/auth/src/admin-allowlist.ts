import type { Database } from "@workspace/db";
import { user as userTable } from "@workspace/db/schema/auth";
import { eq, inArray, sql } from "drizzle-orm";

/** Admins are the verified emails listed in ADMIN_EMAILS (comma-separated). */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string, emailVerified: boolean, allowlist: readonly string[]) {
  return emailVerified && allowlist.includes(email.trim().toLowerCase());
}

const isAdminRole = (role: string | null | undefined) => (role ?? "").split(",").includes("admin");

/**
 * Makes the stored role match the allowlist for every user. The role column is
 * only a cache of the allowlist: nothing in the app edits it, so a restored
 * database or a changed ADMIN_EMAILS converges here at boot.
 */
export async function reconcileAdminRoles(db: Database, allowlist: readonly string[]) {
  const listed = allowlist.length
    ? inArray(sql`lower(${userTable.email})`, [...allowlist])
    : sql`false`;
  const entitled = sql`(${userTable.emailVerified} AND ${listed})`;
  const holdsRole = sql`coalesce(${userTable.role}, '') ~ '(^|,)admin(,|$)'`;
  await db
    .update(userTable)
    .set({ role: "admin" })
    .where(sql`${entitled} AND NOT ${holdsRole}`);
  await db
    .update(userTable)
    .set({ role: "user" })
    .where(sql`${holdsRole} AND NOT ${entitled}`);
}

/** Applies the allowlist to one user, e.g. as their session is created. */
export async function syncAdminRole(
  db: Database,
  user: { id: string; email: string; emailVerified: boolean; role?: string | null },
  allowlist: readonly string[],
) {
  const entitled = isAdminEmail(user.email, user.emailVerified, allowlist);
  if (entitled === isAdminRole(user.role)) return;
  await db
    .update(userTable)
    .set({ role: entitled ? "admin" : "user" })
    .where(eq(userTable.id, user.id));
}

export { isAdminRole };
