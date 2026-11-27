import { createdAt, deletedAt, id } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { MEDIA_KINDS, MEDIA_LIMITS, MEDIA_MIME } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const raw = (value: number) => sql.raw(String(value));
const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(","));

/**
 * One image a user made (ADR 0040), synced through the `my_media` stream. The row says what the
 * image is; the bytes are two objects in the private bucket (`users/<userId>/<id>.jpg` and
 * `<id>_t.jpg`). Rows are immutable once created, except `deleted_at`. Other rows point at a
 * media; a media never points back.
 */
export const media = pgTable(
  "media",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    thumbBytes: integer("thumb_bytes").notNull(),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
    coverUnreferencedAt: timestamp("cover_unreferenced_at", { withTimezone: true, mode: "date" }),
    /** Set by the purge job once the objects of a deleted media are gone from the bucket. */
    objectsPurgedAt: timestamp("objects_purged_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("media_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("media_deleted_at_idx")
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NOT NULL`),
    check("media_kind_known", sql`${table.kind} IN (${quoted(MEDIA_KINDS)})`),
    check("media_mime_jpeg", sql`${table.mime} = '${sql.raw(MEDIA_MIME)}'`),
    check("media_dimensions_positive", sql`${table.width} > 0 AND ${table.height} > 0`),
    check(
      "media_bytes_range",
      sql`${table.bytes} BETWEEN 1 AND ${raw(MEDIA_LIMITS.maxBytes)}
        AND ${table.thumbBytes} BETWEEN 1 AND ${raw(MEDIA_LIMITS.maxBytes)}`,
    ),
  ],
);
