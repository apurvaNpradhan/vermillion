import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import type { AuthEmail } from "@workspace/auth";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Sensitive content lives only while delivery is pending, and cascades with its recipient. A
 * sign-in code for an address with no account yet has no recipient row to cascade from; it is
 * removed on delivery or expiry like the rest.
 */
export const authEmailOutbox = pgTable("auth_email_outbox", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<AuthEmail>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
