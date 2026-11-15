import type { MediaKind } from "@workspace/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Client mirror of `media` in `packages/api/src/media/tables.ts`, fed by the `my_media` stream
 * (ADR 0040). A deleted media leaves the stream (and is deleted here at once by the store), so a
 * row here is always a live image. The bytes are files managed by the attachment queue.
 */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    kind: text("kind").$type<MediaKind>().notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    thumb_bytes: integer("thumb_bytes").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [index("media_kind_idx").on(table.kind)],
);

/**
 * Local only: the state of every media file on this device, owned by PowerSync's
 * `AttachmentQueue` (`ATTACHMENT_TABLE_COLUMNS` in `@powersync/common`). One row per file: the
 * full image has the media id as its id, the thumbnail the id and `_t`. Never synced or uploaded.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey().notNull(),
    filename: text("filename"),
    local_uri: text("local_uri"),
    timestamp: integer("timestamp"),
    size: integer("size"),
    media_type: text("media_type"),
    state: integer("state"),
    has_synced: integer("has_synced"),
    meta_data: text("meta_data"),
  },
  (table) => [index("attachments_state_idx").on(table.state)],
);
