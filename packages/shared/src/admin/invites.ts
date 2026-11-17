import { z } from "zod";

/**
 * Invites (the closed beta). A new account may be created only by an address with a live invite.
 * `expired` is derived from `invited` plus a past expiry; it is never stored.
 */
export const STORED_INVITE_STATES = ["requested", "invited", "redeemed", "revoked"] as const;
export type StoredInviteState = (typeof STORED_INVITE_STATES)[number];

export const INVITE_STATES = [...STORED_INVITE_STATES, "expired"] as const;
export const inviteStateSchema = z.enum(INVITE_STATES);
export type InviteState = z.infer<typeof inviteStateSchema>;

/** An invite works this long after it is sent (or sent again). */
export const INVITE_TTL_DAYS = 14;
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** The state a person sees: an `invited` row past its expiry is `expired`. */
export function inviteState(
  stored: StoredInviteState,
  expiresAt: Date | null,
  now: Date = new Date(),
): InviteState {
  if (stored === "invited" && expiresAt !== null && expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return stored;
}

/** Whether this invite lets its address create an account now. */
export function inviteAllowsSignUp(
  stored: StoredInviteState,
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  return inviteState(stored, expiresAt, now) === "invited";
}

/**
 * How sign-up works on this server: `open` (anyone), `invite` (an address with a live invite) or
 * `closed` (nobody new). The registration-status endpoint reports it.
 */
export const REGISTRATION_MODES = ["open", "invite", "closed"] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/** Lower-cased, trimmed: the form every stored and compared address takes. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
