import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import type { AuthEmail } from "@workspace/auth";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Sensitive content lives only while delivery is pending, and cascades with its recipient. */
export const authEmailOutbox = pgTable("auth_email_outbox", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<AuthEmail>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
