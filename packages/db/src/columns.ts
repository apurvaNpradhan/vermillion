import { timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** Client-generatable, time-ordered primary key. Use on every app table. */
export function id() {
  return uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
}

/** `created_at`: a UTC instant (timestamptz), set by the database. */
export function createdAt() {
  return timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();
}

/** `updated_at`: a UTC instant, refreshed by Drizzle on every update. */
export function updatedAt() {
  return timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
}

export { uuidv7 };
