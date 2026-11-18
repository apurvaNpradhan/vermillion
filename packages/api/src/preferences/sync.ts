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

const wire = z
  .strictObject({
    locale: updatePreferencesSchema.shape.locale,
    timezone: updatePreferencesSchema.shape.timezone,
    ui: wireJson.pipe(updatePreferencesSchema.shape.ui.unwrap()).optional(),
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
      await updatePreferences(db, userId, parsed.data);
    } catch (error) {
      // A foreign or unusable avatar image is a permanent refusal, not a retry.
      if (error instanceof ORPCError) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
      throw error;
    }
  },
  purgeTombstones: async () => 0,
};
