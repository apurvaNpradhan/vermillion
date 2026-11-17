import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { STORED_INVITE_STATES, type StoredInviteState } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * One address's place in the closed beta: an access request, an invite, or both in turn. The
 * address is the gate (an account may be created by an address with a live invite); the token
 * only lets the invite link prefill the address on the site, and is stored hashed. `expired` is
 * derived from `invited` plus a past `expires_at`.
 */
export const accessInvite = pgTable(
  "access_invite",
  {
    id: id(),
    /** Lower-cased. */
    email: text("email").notNull(),
    state: text("state").$type<StoredInviteState>().notNull(),
    /** SHA-256 of the invite link's token (hex); a resend replaces it. */
    tokenHash: text("token_hash"),
    requestedAt: timestamptz("requested_at"),
    invitedAt: timestamptz("invited_at"),
    expiresAt: timestamptz("expires_at"),
    redeemedAt: timestamptz("redeemed_at"),
    redeemedBy: text("redeemed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("access_invite_email_uidx").on(table.email),
    uniqueIndex("access_invite_token_uidx").on(table.tokenHash),
    index("access_invite_state_idx").on(table.state, table.createdAt),
    check(
      "access_invite_state_known",
      sql`${table.state} IN (${sql.raw(STORED_INVITE_STATES.map((s) => `'${s}'`).join(", "))})`,
    ),
    check("access_invite_email_lower", sql`${table.email} = lower(${table.email})`),
  ],
);
