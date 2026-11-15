import { openapi } from "@orpc/openapi";
import { mediaVariantSchema } from "@workspace/shared";
import { z } from "zod";

import { authed } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import { signDownload, signUpload } from "./operations/sign-url";

const mediaApi = authed.meta(openapi({ tags: ["Media"] }));

const target = z.object({ mediaId: z.uuid(), variant: mediaVariantSchema });

const uploadUrl = mediaApi
  .meta(
    openapi({
      method: "POST",
      path: "/media/upload-url",
      summary: "Sign a PUT for one object of a media",
      description:
        "Valid for 5 minutes. Send the body with exactly the returned headers: the signature covers the content type and length of the media row.",
    }),
  )
  .use(rateLimit({ name: "media.uploadUrl", windowMs: 60_000, max: 240 }))
  .input(target)
  .output(
    z.object({
      url: z.string(),
      expiresAt: z.iso.datetime(),
      headers: z.object({ "Content-Type": z.string(), "Content-Length": z.string() }),
    }),
  )
  .handler(({ context, input }) =>
    signUpload(context.services, context.userId, input.mediaId, input.variant),
  );

const downloadUrl = mediaApi
  .meta(
    openapi({
      method: "POST",
      path: "/media/download-url",
      summary: "Sign a GET for one object of a media",
      description: "Valid for 1 hour.",
    }),
  )
  .use(rateLimit({ name: "media.downloadUrl", windowMs: 60_000, max: 600 }))
  .input(target)
  .output(z.object({ url: z.string(), expiresAt: z.iso.datetime() }))
  .handler(({ context, input }) =>
    signDownload(context.services, context.userId, input.mediaId, input.variant),
  );

export const mediaRouter = { uploadUrl, downloadUrl };
