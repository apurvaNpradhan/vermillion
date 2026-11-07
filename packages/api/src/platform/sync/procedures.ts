import { openapi } from "@orpc/openapi";
import { ORPCError } from "@orpc/server";
import {
  syncCredentialsSchema,
  syncErrorDataSchema,
  syncUploadRequestSchema,
  syncUploadResultSchema,
  type SyncErrorData,
} from "@workspace/shared";
import { z } from "zod";

import { authed } from "../orpc/base";
import { applyUpload, SyncRefusal } from "./upload";

const syncApi = authed.meta(openapi({ tags: ["Sync"] }));

const STATUS_CODE_BY_SYNC_CODE = {
  SYNC_WRONG_ACCOUNT: "CONFLICT",
  SYNC_REPLAY_MISMATCH: "CONFLICT",
  SYNC_CLIENT_INCOMPATIBLE: "BAD_REQUEST",
  SYNC_INVALID_REQUEST: "BAD_REQUEST",
  SYNC_RATE_LIMITED: "TOO_MANY_REQUESTS",
  SYNC_TRANSIENT: "BAD_GATEWAY",
} as const satisfies Record<SyncErrorData["code"], string>;

function refusal(data: SyncErrorData) {
  return new ORPCError(STATUS_CODE_BY_SYNC_CODE[data.code], { message: data.code, data });
}

/** Seconds of a token, from its (unverified, just minted) payload. */
const jwtPayloadSchema = z.object({ exp: z.number().int() });

function expiresAtOf(token: string) {
  const payload = token.split(".")[1] ?? "";
  const json = Buffer.from(payload, "base64url").toString("utf8");
  return new Date(jwtPayloadSchema.parse(JSON.parse(json)).exp * 1000).toISOString();
}

const credentials = syncApi
  .meta(
    openapi({
      method: "POST",
      path: "/sync/credentials",
      summary: "PowerSync credentials",
      description:
        "A short-lived token for the PowerSync service, the service URL, the account it is for and when it expires.",
    }),
  )
  .output(syncCredentialsSchema)
  .handler(async ({ context, errors }) => {
    const { endpoint } = context.services.config.sync;
    if (!endpoint) throw errors.BAD_GATEWAY({ message: "Sync is not configured" });
    const { token } = await context.services.auth.api.getToken({ headers: context.headers });
    return { endpoint, token, userId: context.userId, expiresAt: expiresAtOf(token) };
  });

const upload = syncApi
  .meta(
    openapi({
      method: "POST",
      path: "/sync/upload",
      summary: "Upload one client transaction",
      description:
        "Applies one local write transaction atomically and idempotently. Refusals that are not a decision about the writes answer with an error whose data is a sync error code.",
    }),
  )
  .input(syncUploadRequestSchema)
  .output(syncUploadResultSchema)
  .handler(({ context, input }) => {
    // One transaction can carry many writes: this bounds requests, not rows.
    const allowed = context.services.rateLimiter.hit(`sync.upload:${context.userId}`, {
      windowMs: 60_000,
      max: 600,
    });
    if (!allowed) throw refusal({ code: "SYNC_RATE_LIMITED" });
    return applyUpload(context.services.db, context.userId, input).catch((error) => {
      throw error instanceof SyncRefusal ? refusal(syncErrorDataSchema.parse(error.data)) : error;
    });
  });

export const syncRouter = { credentials, upload };
