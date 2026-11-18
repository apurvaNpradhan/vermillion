import { ORPCError } from "@orpc/server";
import { SyncRejection } from "../../platform/sync/handler";
import { media, assertMediaReference } from "../../media/index";
import type { DbExecutor } from "@workspace/db";
import type { Preferences, UpdatePreferences } from "@workspace/shared";
import { and, eq, sql } from "drizzle-orm";

import { userPreferences } from "../tables";
import { getPreferences } from "./get-preferences";

/**
 * Saves any subset of the preferences, creating the row on first write. `ui`
 * merges key by key in one statement, so concurrent updates of different keys
 * both survive. `null` clears locale or timezone; omitted fields are untouched.
 */
export async function updatePreferences(
  db: DbExecutor,
  userId: string,
  input: UpdatePreferences,
): Promise<Preferences> {
  const patch = {
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
  const ui = input.ui ?? {};
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`avatar:${userId}`}, 0))`);
    const previous = await getPreferences(tx, userId);
    // Only a changed avatar is checked: a device that merely re-sends the current one, or an old
    // one it never changed, must not lose its other edits to a media check.
    if (ui.avatarMediaId && ui.avatarMediaId !== previous.ui.avatarMediaId) {
      try {
        await assertMediaReference(tx, userId, ui.avatarMediaId, "avatar");
      } catch (error) {
        if (error instanceof SyncRejection) throw new ORPCError("BAD_REQUEST");
        throw error;
      }
    }
    await tx
      .insert(userPreferences)
      .values({ userId, ...patch, ui })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          ...patch,
          ui: sql`${userPreferences.ui} || excluded.ui`,
          updatedAt: new Date(),
        },
      });
    if (
      ui.avatarMediaId !== undefined &&
      previous.ui.avatarMediaId &&
      previous.ui.avatarMediaId !== ui.avatarMediaId
    ) {
      await tx
        .update(media)
        .set({ deletedAt: new Date() })
        .where(and(eq(media.id, previous.ui.avatarMediaId), eq(media.userId, userId)));
    }
  });
  return getPreferences(db, userId);
}
