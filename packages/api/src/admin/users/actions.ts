import { ORPCError } from "@orpc/server";
import type { Transaction } from "@workspace/db";
import { session, user } from "@workspace/db/schema/auth";
import { isAdminEmail } from "@workspace/auth";
import { eq } from "drizzle-orm";

import { deleteAccountData } from "../../account/index";
import type { Services } from "../../platform/services";

/**
 * The account an admin acts on. Refuses (FORBIDDEN) the admin's own account and any other
 * address in `ADMIN_EMAILS`, so nobody locks themselves or another admin out by a slip.
 */
export async function targetAccount(services: Services, actorId: string, userId: string) {
  const [account] = await services.db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!account) throw new ORPCError("NOT_FOUND", { message: "No such account" });
  if (account.id === actorId) {
    throw new ORPCError("FORBIDDEN", {
      message: "You cannot do this to your own account",
      data: { code: "ADMIN_SELF_ACTION" },
    });
  }
  if (isAdminEmail(account.email, account.emailVerified, services.config.adminEmails)) {
    throw new ORPCError("FORBIDDEN", {
      message: "This account is an admin",
      data: { code: "ADMIN_TARGET_IS_ADMIN" },
    });
  }
  return account;
}

/** Signs the account out everywhere; returns how many sessions ended. */
export async function revokeSessions(tx: Transaction, userId: string): Promise<number> {
  const ended = await tx
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return ended.length;
}

/** Bans the account (and signs it out): sign-in and sync credentials are refused from now on. */
export async function banAccount(tx: Transaction, userId: string, reason: string) {
  await tx
    .update(user)
    .set({ banned: true, banReason: reason, banExpires: null })
    .where(eq(user.id, userId));
  await revokeSessions(tx, userId);
}

export async function unbanAccount(tx: Transaction, userId: string) {
  await tx
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, userId));
}

/**
 * Deletes the account the way the app's own deletion does: the purgers of every vertical first
 * (media objects, sync state, cleanup jobs), then the user row, whose rows cascade with it.
 */
export async function deleteAccount(services: Services, tx: Transaction, userId: string) {
  await deleteAccountData(services, userId);
  await tx.delete(user).where(eq(user.id, userId));
}
