import type { Database } from "@workspace/db";
import { user as userTable } from "@workspace/db/schema/auth";
import { normalizeEmail, parseCsv } from "@workspace/shared";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Admins are the addresses listed in `ADMIN_EMAILS` and nobody else. The `role` column is a cache
 * of that list: on server start and on every sign-in it is reconciled, so a listed address is
 * `admin` and every other account is `user`. Nothing in the app edits it.
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  return parseCsv(raw).map(normalizeEmail);
}

/** A verified address on the list. */
export function isAdminEmail(email: string, emailVerified: boolean, allowlist: readonly string[]) {
  return emailVerified && allowlist.includes(normalizeEmail(email));
}

/** Makes every stored role match the list (server start). */
export async function reconcileAdminRoles(db: Database, allowlist: readonly string[]) {
  const listed = allowlist.length
    ? inArray(sql`lower(${userTable.email})`, [...allowlist])
    : sql`false`;
  const entitled = sql`(${userTable.emailVerified} AND ${listed})`;
  await db
    .update(userTable)
    .set({ role: "admin" })
    .where(sql`${entitled} AND ${userTable.role} IS DISTINCT FROM 'admin'`);
  await db
    .update(userTable)
    .set({ role: "user" })
    .where(sql`NOT ${entitled} AND ${userTable.role} IS DISTINCT FROM 'user'`);
}

/** Applies the list to one account (each sign-in). */
export async function syncAdminRole(
  db: Database,
  account: { id: string; email: string; emailVerified: boolean; role: string | null },
  allowlist: readonly string[],
) {
  const role = isAdminEmail(account.email, account.emailVerified, allowlist) ? "admin" : "user";
  if (account.role === role) return;
  await db.update(userTable).set({ role }).where(eq(userTable.id, account.id));
}
