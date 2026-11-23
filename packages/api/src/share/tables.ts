import { createdAt, id } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { SHARE_CODE_LENGTH, SHARE_LINK_KINDS, SHARE_SNAPSHOT_MAX_BYTES } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(","));

/**
 * A Share link (ADR 0058): an immutable snapshot of a Program or Workout under a short public
 * code. Not synced: links live on the server only. The row never changes after it is created,
 * except `revoked_at`, which the owner sets to turn the link off; the snapshot stays for the
 * owner's records but is never served again.
 */
export const shareLink = pgTable(
  "share_link",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Six characters of the unambiguous alphabet; the public handle. */
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    /** Denormalized from the snapshot for the owner's list. */
    title: text("title"),
    /** A `sigil.program/v1` or `sigil.workout/v1` document, validated before it is stored. */
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("share_link_code_uidx").on(table.code),
    index("share_link_user_id_idx").on(table.userId, table.createdAt.desc()),
    check(
      "share_link_code_length",
      sql`char_length(${table.code}) = ${sql.raw(String(SHARE_CODE_LENGTH))}`,
    ),
    check("share_link_kind_known", sql`${table.kind} IN (${quoted(SHARE_LINK_KINDS)})`),
    check(
      "share_link_snapshot_size",
      sql`pg_column_size(${table.snapshot}) <= ${sql.raw(String(SHARE_SNAPSHOT_MAX_BYTES * 2))}`,
    ),
  ],
);
