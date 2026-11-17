import { createHash, randomBytes } from "node:crypto";

import type { DbExecutor } from "@workspace/db";
import { user } from "@workspace/db/schema/auth";
import {
  INVITE_TTL_MS,
  inviteAllowsSignUp,
  inviteState,
  normalizeEmail,
  type InviteState,
  type StoredInviteState,
} from "@workspace/shared";
import { and, desc, eq, gt, ilike, lte, sql, type SQL } from "drizzle-orm";

import { accessInvite } from "../tables";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh link token and its stored hash. */
function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

type InviteRow = typeof accessInvite.$inferSelect;

export function toInviteView(row: InviteRow, now = new Date()) {
  return {
    id: row.id,
    email: row.email,
    state: inviteState(row.state, row.expiresAt, now),
    requestedAt: row.requestedAt?.toISOString() ?? null,
    invitedAt: row.invitedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    redeemedBy: row.redeemedBy,
  };
}

/**
 * Records an access request. Changes nothing for an address that already has a row or an account,
 * so the caller can answer the same whatever the address is.
 */
export async function requestAccess(db: DbExecutor, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  if (existing) return;
  await db
    .insert(accessInvite)
    .values({ email, state: "requested", requestedAt: new Date() })
    .onConflictDoNothing({ target: accessInvite.email });
}

/** Whether this address may create an account now (an `invited` row that has not expired). */
export async function hasLiveInvite(db: DbExecutor, rawEmail: string): Promise<boolean> {
  const [row] = await db
    .select({ state: accessInvite.state, expiresAt: accessInvite.expiresAt })
    .from(accessInvite)
    .where(eq(accessInvite.email, normalizeEmail(rawEmail)))
    .limit(1);
  return row ? inviteAllowsSignUp(row.state, row.expiresAt) : false;
}

/** Marks the address's live invite redeemed by the new account (once; later calls do nothing). */
export async function redeemInvite(db: DbExecutor, account: { id: string; email: string }) {
  const now = new Date();
  await db
    .update(accessInvite)
    .set({ state: "redeemed", redeemedAt: now, redeemedBy: account.id, tokenHash: null })
    .where(
      and(
        eq(accessInvite.email, normalizeEmail(account.email)),
        eq(accessInvite.state, "invited"),
        gt(accessInvite.expiresAt, now),
      ),
    );
}

/** The invite a link's token points at, while it is still the current token. */
export async function inviteByToken(db: DbExecutor, token: string) {
  const [row] = await db
    .select()
    .from(accessInvite)
    .where(eq(accessInvite.tokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}

export async function inviteById(db: DbExecutor, id: string) {
  const [row] = await db.select().from(accessInvite).where(eq(accessInvite.id, id)).limit(1);
  return row ?? null;
}

/** Turns a row into a live invite with a fresh token and a new 14-day expiry. */
export async function issueInvite(db: DbExecutor, id: string) {
  const now = new Date();
  const { token, tokenHash } = newToken();
  const [row] = await db
    .update(accessInvite)
    .set({
      state: "invited",
      tokenHash,
      invitedAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .where(eq(accessInvite.id, id))
    .returning();
  if (!row) throw new Error("Invite vanished while it was issued");
  return { row, token };
}

/** Creates (or reuses) the row of an address the admin invites directly. */
export async function upsertDirectInvite(db: DbExecutor, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  await db
    .insert(accessInvite)
    .values({ email, state: "requested" })
    .onConflictDoNothing({ target: accessInvite.email });
  const [row] = await db.select().from(accessInvite).where(eq(accessInvite.email, email)).limit(1);
  if (!row) throw new Error("Invite row missing after insert");
  return row;
}

export async function revokeInvite(db: DbExecutor, id: string) {
  await db
    .update(accessInvite)
    .set({ state: "revoked", tokenHash: null })
    .where(eq(accessInvite.id, id));
}

export type ListInvitesInput = {
  state?: InviteState | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
};

/** One page of rows by derived state, newest first. */
export async function listInvites(db: DbExecutor, input: ListInvitesInput) {
  const now = new Date();
  const filters: SQL[] = [];
  const stored = (state: StoredInviteState) => eq(accessInvite.state, state);
  if (input.state === "expired") {
    filters.push(stored("invited"), lte(accessInvite.expiresAt, now));
  } else if (input.state === "invited") {
    filters.push(stored("invited"), gt(accessInvite.expiresAt, now));
  } else if (input.state) {
    filters.push(stored(input.state));
  }
  const search = input.search?.trim();
  if (search) {
    filters.push(ilike(accessInvite.email, `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(accessInvite)
      .where(where)
      .orderBy(desc(accessInvite.updatedAt), desc(accessInvite.id))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accessInvite)
      .where(where),
  ]);
  return { invites: rows.map((row) => toInviteView(row, now)), total: total?.count ?? 0 };
}
