import { openapi } from "@orpc/openapi";
import {
  CLIENT_IP_HEADER,
  SHARE_SNAPSHOT_MAX_BYTES,
  shareCodeSchema,
  shareLinkKindSchema,
  shareSnapshotSchema,
} from "@workspace/shared";
import { z } from "zod";

import { authed, base } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import { createLink, listLinks, readPublicLink, revokeLink } from "./operations/links";

const linkApi = authed.meta(openapi({ tags: ["Share links"] }));

const summarySchema = z.object({
  code: shareCodeSchema,
  kind: shareLinkKindSchema,
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

const toSummary = (link: {
  code: string;
  kind: "program" | "workout";
  title: string | null;
  createdAt: Date;
}) => ({
  ...link,
  createdAt: link.createdAt.toISOString(),
});

/** Stores a snapshot and returns its code. The snapshot never changes afterwards. */
const create = linkApi
  .meta(
    openapi({
      method: "POST",
      path: "/share-links",
      successStatus: 201,
      summary: "Create a Share link",
      description:
        "Stores an immutable `sigil.program/v1` or `sigil.workout/v1` snapshot under a six-character code.",
    }),
  )
  .use(rateLimit({ name: "share.create", windowMs: 60_000, max: 30 }))
  .input(z.object({ snapshot: shareSnapshotSchema }))
  .output(summarySchema)
  .handler(async ({ context, input, errors }) => {
    if (JSON.stringify(input.snapshot).length > SHARE_SNAPSHOT_MAX_BYTES) {
      throw errors.BAD_REQUEST({ message: "That plan is too large to share" });
    }
    const result = await createLink(context.services.db, context.userId, input.snapshot);
    if (result.status === "limit") {
      throw errors.CONFLICT({ message: "Too many active links: turn some off first" });
    }
    if (result.status === "no-code") {
      throw errors.CONFLICT({ message: "Could not make a code: try again" });
    }
    return toSummary(result.link);
  });

/** The owner's live links, for the Shared links list. */
const list = linkApi
  .meta(openapi({ method: "GET", path: "/share-links", summary: "List my Share links" }))
  .output(z.object({ links: z.array(summarySchema) }))
  .handler(async ({ context }) => ({
    links: (await listLinks(context.services.db, context.userId)).map(toSummary),
  }));

/** Turns a link off. The code of another user's link answers NOT_FOUND. */
const revoke = linkApi
  .meta(
    openapi({
      method: "POST",
      path: "/share-links/{code}/revoke",
      summary: "Revoke a Share link",
      description: "Idempotent. A revoked code answers 410 Gone to everyone.",
    }),
  )
  .use(rateLimit({ name: "share.revoke", windowMs: 60_000, max: 60 }))
  .input(z.object({ code: shareCodeSchema }))
  .output(z.object({ revoked: z.literal(true) }))
  .handler(async ({ context, input, errors }) => {
    if (!(await revokeLink(context.services.db, context.userId, input.code))) {
      throw errors.NOT_FOUND({ message: "No such link" });
    }
    return { revoked: true as const };
  });

const publicApi = base.meta(openapi({ tags: ["Share links"] }));

/** Rate limit per client IP: 6 characters of 31 is 887M codes, and this keeps guessing hopeless. */
const READ_LIMIT = { windowMs: 60_000, max: 120 };

/** The snapshot behind a code. Public: the app, the web preview and a future library read it. */
const get = publicApi
  .meta(
    openapi({
      method: "GET",
      path: "/share-links/{code}",
      summary: "Read a Share link",
      description: "Public. 404 for an unknown code, 410 for a revoked one.",
    }),
  )
  .input(z.object({ code: shareCodeSchema }))
  .output(
    z.object({ code: shareCodeSchema, snapshot: shareSnapshotSchema, createdAt: z.iso.datetime() }),
  )
  .handler(async ({ context, input, errors }) => {
    const ip = context.headers.get(CLIENT_IP_HEADER) ?? "unknown";
    if (!context.services.rateLimiter.hit(`share.get:${ip}`, READ_LIMIT)) {
      throw errors.TOO_MANY_REQUESTS({ message: "Too many requests" });
    }
    const link = await readPublicLink(context.services.db, input.code);
    if (link.status === "gone") throw errors.GONE({ message: "That link was turned off" });
    if (link.status === "missing") throw errors.NOT_FOUND({ message: "No such link" });
    return {
      code: link.code,
      snapshot: link.snapshot,
      createdAt: link.createdAt.toISOString(),
    };
  });

export const shareRouter = { create, list, revoke, get };
