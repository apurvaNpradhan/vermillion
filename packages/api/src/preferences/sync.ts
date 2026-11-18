import { ORPCError } from "@orpc/server";
import { updatePreferencesSchema } from "@workspace/shared";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { updatePreferences } from "./operations/update-preferences";

/** JSON travels as text (SQLite stores it that way); an empty or missing value changes nothing. */
const wireJson = z.string().transform((text, ctx) => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid JSON" });
    return z.NEVER;
  }
});

/**
 * What one local write changed (ADR 0049): only the keys the user touched, so an `omitted` key and
 * an explicit `null` stay apart (a PUT drops NULL columns, JSON keeps them). `writtenAt` only
 * makes two writes of the same keys differ, so neither is skipped as "no change".
 */
const dirtyPatch = updatePreferencesSchema
  .extend({ writtenAt: z.string().max(40).optional() })
  .strict();

const wire = z
  .strictObject({
    locale: updatePreferencesSchema.shape.locale,
    timezone: updatePreferencesSchema.shape.timezone,
    ui: wireJson.pipe(updatePreferencesSchema.shape.ui.unwrap()).optional(),
    patch: wireJson.pipe(dirtyPatch).optional(),
  })
  .partial();

/**
 * `sync.upload` for `user_preferences`: one row per user that is never deleted. Whatever row id the
 * device made, the write merges into the user's single row (`ui` key by key), through the same
 * operation as the older `preferences.update` procedure, so both paths validate alike.
 */
export const preferencesSyncHandler: SyncTableHandler = {
  table: "user_preferences",
  async apply(db, userId, op) {
    if (op.op === "DELETE") throw new SyncRejection("SYNC_INVALID_OP");
    const parsed = wire.safeParse(op.opData ?? {});
    if (!parsed.success) throw new SyncRejection("SYNC_INVALID_OP");
    try {
      // A patch is the whole truth of its write; the plain columns beside it are the local view.
      const { patch, ...columns } = parsed.data;
      if (patch) {
        const { writtenAt: _writtenAt, ...changes } = patch;
        await updatePreferences(db, userId, changes);
      } else await updatePreferences(db, userId, columns);
    } catch (error) {
      // A foreign or unusable avatar image is a permanent refusal, not a retry.
      if (error instanceof ORPCError) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
      throw error;
    }
  },
  purgeTombstones: async () => 0,
};
