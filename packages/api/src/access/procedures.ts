import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import { isDisposableEmail } from "@workspace/auth";
import { user } from "@workspace/db/schema/auth";
import {
  CLIENT_IP_HEADER,
  inviteState,
  inviteStateSchema,
  normalizeEmail,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { admin } from "../admin/index";
import { base } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import type { Services } from "../platform/services";
import {
  inviteById,
  inviteByToken,
  issueInvite,
  listInvites,
  requestAccess,
  revokeInvite,
  toInviteView,
  upsertDirectInvite,
} from "./operations/invites";
import { sendInviteEmail } from "./operations/send-invite";

/** Requests per client IP, and per address, per hour. Over the address limit nothing changes. */
const REQUEST_LIMITS = { perIp: 5, perAddress: 3, windowMs: 60 * 60 * 1000 };

const accessApi = base.meta(openapi({ tags: ["Access"] }));

function limited(services: Services, key: string, max: number) {
  return !services.rateLimiter.hit(`access.request:${key}`, {
    windowMs: REQUEST_LIMITS.windowMs,
    max,
  });
}

/**
 * Asks to join the beta. The answer is the same whether the address was unknown, already asked,
 * was invited or has an account, so the form reveals nothing. Rate limited per IP and per
 * address; there is no CAPTCHA (ADR 0056).
 */
const request = accessApi
  .meta(
    openapi({
      method: "POST",
      path: "/access/requests",
      summary: "Request access to the beta",
      description:
        "Always answers the same for a valid address. Rate limited per IP and per address.",
    }),
  )
  .input(z.object({ email: z.email().max(320) }))
  .output(z.object({ received: z.literal(true) }))
  .handler(async ({ context, input, errors }) => {
    const { services } = context;
    const ip = context.headers.get(CLIENT_IP_HEADER) ?? "unknown";
    if (limited(services, `ip:${ip}`, REQUEST_LIMITS.perIp)) {
      throw errors.TOO_MANY_REQUESTS({ message: "Too many requests" });
    }
    const email = normalizeEmail(input.email);
    if (isDisposableEmail(email)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Disposable addresses are not accepted",
        data: { code: "DISPOSABLE_EMAIL_NOT_ALLOWED" },
      });
    }
    if (!limited(services, `email:${email}`, REQUEST_LIMITS.perAddress)) {
      await requestAccess(services.db, email);
    }
    return { received: true as const };
  });

/** What an invite link's token says: the address to prefill and whether it still works. */
const invite = accessApi
  .meta(openapi({ method: "GET", path: "/access/invite", summary: "Read an invite link" }))
  .input(z.object({ token: z.string().min(16).max(128) }))
  .output(z.object({ email: z.string(), state: inviteStateSchema }))
  .handler(async ({ context, input, errors }) => {
    const ip = context.headers.get(CLIENT_IP_HEADER) ?? "unknown";
    if (limited(context.services, `invite:${ip}`, 30)) {
      throw errors.TOO_MANY_REQUESTS({ message: "Too many requests" });
    }
    const row = await inviteByToken(context.services.db, input.token);
    if (!row) throw errors.NOT_FOUND({ message: "No such invite" });
    return { email: row.email, state: inviteState(row.state, row.expiresAt) };
  });

export const accessRouter = { request, invite };

const accessAdmin = admin.meta(openapi({ tags: ["Admin"] }));
const writes = rateLimit({ name: "admin.access.write", windowMs: 60_000, max: 60 });
const inviteView = z.object({
  id: z.string(),
  email: z.string(),
  state: inviteStateSchema,
  requestedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  redeemedAt: z.string().nullable(),
  redeemedBy: z.string().nullable(),
});
const byId = z.object({ id: z.uuid() });

const conflict = (message: string) => new ORPCError("CONFLICT", { message });

async function loadInvite(services: Services, id: string) {
  const row = await inviteById(services.db, id);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "No such invite" });
  return row;
}

const list = accessAdmin
  .meta(openapi({ method: "GET", path: "/admin/access", summary: "Access requests and invites" }))
  .input(
    z.object({
      state: inviteStateSchema.optional(),
      search: z.string().trim().max(200).optional(),
      page: z.number().int().min(1).max(100_000).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .output(z.object({ invites: z.array(inviteView), total: z.number().int() }))
  .handler(({ context, input }) => listInvites(context.services.db, input));

/** Approves a request: it becomes a live invite and the invite email goes out. */
const approve = accessAdmin
  .meta(
    openapi({ method: "POST", path: "/admin/access/{id}/approve", summary: "Approve a request" }),
  )
  .use(writes)
  .input(byId)
  .output(inviteView)
  .handler(async ({ context, input }) => {
    const row = await loadInvite(context.services, input.id);
    if (row.state !== "requested") throw conflict("Only a request can be approved");
    const issued = await context.audited(
      (tx) => issueInvite(tx, row.id),
      ({ row: next }) => ({
        action: "access.approve",
        targetType: "invite",
        targetId: next.id,
        detail: {},
      }),
    );
    await sendInviteEmail(context.services, issued.row.email, issued.token);
    return toInviteView(issued.row);
  });

/** Invites an address that never asked. An address with an account or a live invite is refused. */
const inviteDirect = accessAdmin
  .meta(
    openapi({
      method: "POST",
      path: "/admin/access/invites",
      summary: "Invite an address",
      successStatus: 201,
    }),
  )
  .use(writes)
  .input(z.object({ email: z.email().max(320) }))
  .output(inviteView)
  .handler(async ({ context, input }) => {
    const email = normalizeEmail(input.email);
    const [account] = await context.services.db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    if (account) throw conflict("This address already has an account");
    const issued = await context.audited(
      async (tx) => {
        const row = await upsertDirectInvite(tx, email);
        const state = inviteState(row.state, row.expiresAt);
        if (state === "invited" || state === "redeemed") throw conflict("Already invited");
        return issueInvite(tx, row.id);
      },
      ({ row }) => ({
        action: "access.invite",
        targetType: "invite",
        targetId: row.id,
        detail: {},
      }),
    );
    await sendInviteEmail(context.services, issued.row.email, issued.token);
    return toInviteView(issued.row);
  });

/** Sends a live or expired invite again, with a new link and a new 14-day expiry. */
const resend = accessAdmin
  .meta(openapi({ method: "POST", path: "/admin/access/{id}/resend", summary: "Resend an invite" }))
  .use(writes)
  .input(byId)
  .output(inviteView)
  .handler(async ({ context, input }) => {
    const row = await loadInvite(context.services, input.id);
    if (row.state !== "invited") throw conflict("Only a sent invite can be sent again");
    const issued = await context.audited(
      (tx) => issueInvite(tx, row.id),
      ({ row: next }) => ({
        action: "access.resend",
        targetType: "invite",
        targetId: next.id,
        detail: {},
      }),
    );
    await sendInviteEmail(context.services, issued.row.email, issued.token);
    return toInviteView(issued.row);
  });

/** Withdraws a request or an unredeemed invite; the address can no longer sign up. */
const revoke = accessAdmin
  .meta(openapi({ method: "POST", path: "/admin/access/{id}/revoke", summary: "Revoke an invite" }))
  .use(writes)
  .input(byId)
  .output(inviteView)
  .handler(async ({ context, input }) => {
    const row = await loadInvite(context.services, input.id);
    if (row.state === "redeemed" || row.state === "revoked") {
      throw conflict("A redeemed or revoked invite cannot be revoked");
    }
    await context.audited(
      (tx) => revokeInvite(tx, row.id),
      () => ({
        action: "access.revoke",
        targetType: "invite",
        targetId: row.id,
        detail: { from: row.state },
      }),
    );
    return toInviteView(await loadInvite(context.services, row.id));
  });

export const adminAccessRouter = { list, approve, invite: inviteDirect, resend, revoke };
