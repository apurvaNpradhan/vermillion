import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { rateLimit } from "../../platform/orpc/rate-limit";
import { admin } from "../builder";
import { accountRowSchema, accountViewSchema, getAccountView, listUsers } from "./account-view";
import { banAccount, deleteAccount, revokeSessions, targetAccount, unbanAccount } from "./actions";

const usersApi = admin.meta(openapi({ tags: ["Admin"] }));
const writes = rateLimit({ name: "admin.users.write", windowMs: 60_000, max: 60 });
const userId = z.string().min(1).max(64);
const ok = z.object({ success: z.literal(true) });

const list = usersApi
  .meta(openapi({ method: "GET", path: "/admin/users", summary: "List accounts" }))
  .input(
    z.object({
      search: z.string().trim().max(200).optional(),
      banned: z.boolean().optional(),
      page: z.number().int().min(1).max(100_000).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .output(z.object({ users: z.array(accountRowSchema), total: z.number().int() }))
  .handler(({ context, input }) => listUsers(context.services.db, input));

const get = usersApi
  .meta(openapi({ method: "GET", path: "/admin/users/{userId}", summary: "Account view" }))
  .input(z.object({ userId }))
  .output(accountViewSchema)
  .handler(async ({ context, input, errors }) => {
    const view = await getAccountView(context.services.db, input.userId);
    if (!view) throw errors.NOT_FOUND({ message: "No such account" });
    return view;
  });

const ban = usersApi
  .meta(openapi({ method: "POST", path: "/admin/users/{userId}/ban", summary: "Ban an account" }))
  .use(writes)
  .input(z.object({ userId, reason: z.string().trim().min(1).max(500) }))
  .output(ok)
  .handler(async ({ context, input }) => {
    const account = await targetAccount(context.services, context.userId, input.userId);
    await context.audited(
      (tx) => banAccount(tx, account.id, input.reason),
      () => ({
        action: "user.ban",
        targetType: "user",
        targetId: account.id,
        detail: { reason: input.reason },
      }),
    );
    return { success: true as const };
  });

const unban = usersApi
  .meta(openapi({ method: "POST", path: "/admin/users/{userId}/unban", summary: "Lift a ban" }))
  .use(writes)
  .input(z.object({ userId }))
  .output(ok)
  .handler(async ({ context, input }) => {
    const account = await targetAccount(context.services, context.userId, input.userId);
    await context.audited(
      (tx) => unbanAccount(tx, account.id),
      () => ({ action: "user.unban", targetType: "user", targetId: account.id, detail: {} }),
    );
    return { success: true as const };
  });

const revoke = usersApi
  .meta(
    openapi({
      method: "POST",
      path: "/admin/users/{userId}/revoke-sessions",
      summary: "Sign an account out everywhere",
    }),
  )
  .use(writes)
  .input(z.object({ userId }))
  .output(z.object({ revoked: z.number().int() }))
  .handler(async ({ context, input }) => {
    const account = await targetAccount(context.services, context.userId, input.userId);
    const revoked = await context.audited(
      (tx) => revokeSessions(tx, account.id),
      (count) => ({
        action: "user.revoke_sessions",
        targetType: "user",
        targetId: account.id,
        detail: { count },
      }),
    );
    return { revoked };
  });

const remove = usersApi
  .meta(
    openapi({
      method: "DELETE",
      path: "/admin/users/{userId}",
      summary: "Delete an account",
      description:
        "Deletes the account and all its data, as the app's own deletion does. `email` must repeat the account's address.",
    }),
  )
  .use(writes)
  .input(z.object({ userId, email: z.string().trim().max(320) }))
  .output(ok)
  .handler(async ({ context, input, errors }) => {
    const account = await targetAccount(context.services, context.userId, input.userId);
    if (input.email.toLowerCase() !== account.email.toLowerCase()) {
      throw errors.BAD_REQUEST({ message: "The address does not match the account" });
    }
    await context.audited(
      (tx) => deleteAccount(context.services, tx, account.id),
      () => ({ action: "user.delete", targetType: "user", targetId: account.id, detail: {} }),
    );
    return { success: true as const };
  });

export const adminUsersRouter = { list, get, ban, unban, revokeSessions: revoke, delete: remove };
