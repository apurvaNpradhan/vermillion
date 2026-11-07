import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { admin } from "../platform/orpc/base";
import { listUsers } from "./operations/list-users";

const userId = z.string().min(1);

const adminUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.string().nullable(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banExpires: z.string().nullable(),
  createdAt: z.string(),
});

const ok = z.object({ success: z.boolean() });

/** Lets the client ask whether the caller is an admin (it refuses everyone else). */
const adminApi = admin.meta(openapi({ tags: ["Admin"] }));

const access = adminApi
  .meta(
    openapi({
      method: "GET",
      path: "/admin/access",
      summary: "Check admin access",
      description: "Answers 403 for everyone who is not an administrator.",
    }),
  )
  .output(z.object({ admin: z.literal(true) }))
  .handler(() => ({ admin: true as const }));

const users = {
  list: adminApi
    .meta(openapi({ method: "GET", path: "/admin/users", summary: "List users" }))
    .input(
      z.object({
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).max(1_000_000).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .output(z.object({ users: z.array(adminUser), total: z.number().int() }))
    .handler(({ context, input }) => listUsers(context.services, context.headers, input)),
  ban: adminApi
    .meta(openapi({ method: "POST", path: "/admin/users/{userId}/ban", summary: "Ban a user" }))
    .input(z.object({ userId, reason: z.string().max(500).optional() }))
    .output(z.object({ success: z.literal(true) }))
    .handler(async ({ context, input, errors }) => {
      if (input.userId === context.userId)
        throw errors.BAD_REQUEST({ message: "You cannot ban yourself." });
      await context.services.auth.api.banUser({
        headers: context.headers,
        body: { userId: input.userId, banReason: input.reason ?? "Banned by an administrator" },
      });
      return { success: true as const };
    }),
  unban: adminApi
    .meta(openapi({ method: "POST", path: "/admin/users/{userId}/unban", summary: "Unban a user" }))
    .input(z.object({ userId }))
    .output(z.object({ success: z.literal(true) }))
    .handler(async ({ context, input }) => {
      await context.services.auth.api.unbanUser({
        headers: context.headers,
        body: { userId: input.userId },
      });
      return { success: true as const };
    }),
  remove: adminApi
    .meta(openapi({ method: "DELETE", path: "/admin/users/{userId}", summary: "Delete a user" }))
    .input(z.object({ userId }))
    .output(ok)
    .handler(({ context, input }) =>
      context.services.auth.api.removeUser({
        headers: context.headers,
        body: { userId: input.userId },
      }),
    ),
};

export const adminRouter = { access, users };
