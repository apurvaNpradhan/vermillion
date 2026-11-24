import { randomInt } from "node:crypto";

import type { DbExecutor } from "@workspace/db";
import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  shareSnapshotSchema,
  snapshotKind,
  snapshotTitle,
  type ShareLinkKind,
  type ShareSnapshot,
} from "@workspace/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { shareLink } from "../tables";

/** Live links one account may hold, so the table cannot be filled from a single account. */
export const LIVE_LINKS_PER_USER = 200;
const CODE_ATTEMPTS = 8;

/** A random code, uniform over the alphabet (`randomInt` has no modulo bias). */
export function generateShareCode(): string {
  let code = "";
  for (let at = 0; at < SHARE_CODE_LENGTH; at++) {
    code += SHARE_CODE_ALPHABET.charAt(randomInt(SHARE_CODE_ALPHABET.length));
  }
  return code;
}

export type LinkSummary = {
  code: string;
  kind: ShareLinkKind;
  title: string | null;
  createdAt: Date;
};

export type CreateResult =
  | { status: "created"; link: LinkSummary }
  | { status: "limit" }
  | { status: "no-code" };

/**
 * Stores a snapshot under a fresh code. A taken code is retried with another; the unique index
 * decides, so two requests can never share one. The live-link cap is enforced under a per-user
 * advisory lock.
 */
export async function createLink(
  db: DbExecutor,
  userId: string,
  snapshot: ShareSnapshot,
  newCode: () => string = generateShareCode,
): Promise<CreateResult> {
  const kind = snapshotKind(snapshot);
  const title = snapshotTitle(snapshot);
  // Count and insert under one per-user lock, so concurrent creates cannot all pass the cap.
  return db.transaction(async (tx): Promise<CreateResult> => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`share-links:${userId}`}, 0))`,
    );
    const [live] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(shareLink)
      .where(and(eq(shareLink.userId, userId), isNull(shareLink.revokedAt)));
    if ((live?.total ?? 0) >= LIVE_LINKS_PER_USER) return { status: "limit" };
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const [row] = await tx
        .insert(shareLink)
        .values({ userId, code: newCode(), kind, title, snapshot })
        .onConflictDoNothing({ target: shareLink.code })
        .returning();
      if (row) {
        return {
          status: "created",
          link: { code: row.code, kind, title, createdAt: row.createdAt },
        };
      }
    }
    return { status: "no-code" };
  });
}

/** The user's live links, newest first. */
export async function listLinks(db: DbExecutor, userId: string): Promise<LinkSummary[]> {
  const rows = await db
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.userId, userId), isNull(shareLink.revokedAt)))
    .orderBy(desc(shareLink.createdAt), desc(shareLink.id));
  return rows.flatMap((row) =>
    row.kind === "program" || row.kind === "workout"
      ? [{ code: row.code, kind: row.kind, title: row.title, createdAt: row.createdAt }]
      : [],
  );
}

/** Turns the owner's link off. False when the code is not theirs; revoking twice is fine. */
export async function revokeLink(db: DbExecutor, userId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: shareLink.id, revokedAt: shareLink.revokedAt })
    .from(shareLink)
    .where(and(eq(shareLink.code, code), eq(shareLink.userId, userId)))
    .limit(1);
  if (!row) return false;
  if (!row.revokedAt) {
    await db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, row.id));
  }
  return true;
}

export type PublicLink =
  | { status: "found"; code: string; snapshot: ShareSnapshot; createdAt: Date }
  | { status: "gone" }
  | { status: "missing" };

/** What a stranger may read: the snapshot of a live link, nothing about its owner. */
export async function readPublicLink(db: DbExecutor, code: string): Promise<PublicLink> {
  const [row] = await db.select().from(shareLink).where(eq(shareLink.code, code)).limit(1);
  if (!row) return { status: "missing" };
  if (row.revokedAt) return { status: "gone" };
  const snapshot = shareSnapshotSchema.safeParse(row.snapshot);
  // A stored snapshot was valid when written; one a newer format outgrew is treated as gone.
  if (!snapshot.success) return { status: "gone" };
  return { status: "found", code: row.code, snapshot: snapshot.data, createdAt: row.createdAt };
}
