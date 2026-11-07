import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Local-only tables: never synced, never uploaded, kept across restarts. Only acknowledged
// replicated rows are disposable; these must survive any storage migration (ADR 0022).

/** Singleton row: the identity of this install, created with the database (ADR 0018). */
export const installMeta = sqliteTable("install_meta", {
  id: text("id").primaryKey().notNull(),
  install_id: text("install_id").notNull(),
  created_at: text("created_at").notNull(),
});

/**
 * Singleton row: the Device owner, recorded when the first user signs in on this database
 * (ADR 0021). A local identity, not server authorization.
 */
export const deviceOwner = sqliteTable("device_owner", {
  id: text("id").primaryKey().notNull(),
  user_id: text("user_id").notNull(),
  created_at: text("created_at").notNull(),
});

/** Largest payload kept per rejected write, in UTF-8 bytes. */
export const REJECTED_PAYLOAD_MAX_BYTES = 16 * 1024;

/**
 * Writes the server permanently refused, kept so the user can recover them (ADR 0018). Identity is
 * the client transaction plus the operation's ordinal inside it.
 */
export const rejectedWrites = sqliteTable("rejected_writes", {
  id: text("id").primaryKey().notNull(),
  tx_id: text("tx_id").notNull(),
  op_ordinal: integer("op_ordinal").notNull(),
  schema_version: integer("schema_version").notNull(),
  table_name: text("table_name").notNull(),
  row_id: text("row_id").notNull(),
  op: text("op").notNull(),
  code: text("code").notNull(),
  /** JSON of the op's data, truncated by `boundPayload`. */
  payload: text("payload").notNull(),
  payload_truncated: integer("payload_truncated", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
});
