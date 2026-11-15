import { ORPCError } from "@orpc/server";
import type { Database } from "@workspace/db";
import {
  mediaObjectKey,
  MEDIA_MIME,
  MEDIA_UPLOAD_URL_SECONDS,
  type MediaVariant,
} from "@workspace/shared";

import type { ObjectStore } from "../storage";
import { findLiveMedia } from "./lookup";

/** A GET is valid for 1 hour: an image view signs once and the device stores the file. */
export const DOWNLOAD_URL_SECONDS = 60 * 60;

type Context = { db: Database; objectStore: ObjectStore };

/** The row's own media, live; anything else (missing, foreign, deleted) is `NOT_FOUND`. */
async function ownLiveMedia(context: Context, userId: string, mediaId: string) {
  const row = await findLiveMedia(context.db, userId, mediaId);
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

/**
 * Signs a PUT for one object of the user's media. The type and the length come from the row, so
 * the store refuses a body that is not what the device said it would upload.
 */
export async function signUpload(
  context: Context,
  userId: string,
  mediaId: string,
  variant: MediaVariant,
) {
  const row = await ownLiveMedia(context, userId, mediaId);
  const signed = await context.objectStore.signPut(mediaObjectKey(userId, row.id, variant), {
    contentType: MEDIA_MIME,
    contentLength: variant === "thumb" ? row.thumbBytes : row.bytes,
    expiresInSeconds: MEDIA_UPLOAD_URL_SECONDS,
  });
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString(), headers: signed.headers };
}

export async function signDownload(
  context: Context,
  userId: string,
  mediaId: string,
  variant: MediaVariant,
) {
  const row = await ownLiveMedia(context, userId, mediaId);
  const signed = await context.objectStore.signGet(mediaObjectKey(userId, row.id, variant), {
    expiresInSeconds: DOWNLOAD_URL_SECONDS,
  });
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}
