import { z } from "zod";

/**
 * User media (ADR 0040): images a user made on a device, kept in a private bucket. A synced
 * `media` row describes one image; the bytes live in two objects, a full-size JPEG and a
 * thumbnail. Runtime-neutral: the API, the sync package and the native app share it.
 */

export const MEDIA_KINDS = [
  "program_cover",
  "exercise_image",
  "avatar",
  "session_photo",
  "progress_photo",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const mediaKindSchema = z.enum(MEDIA_KINDS);

/** The two objects of one media: the full-size image and its thumbnail. */
export const MEDIA_VARIANTS = ["full", "thumb"] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];
export const mediaVariantSchema = z.enum(MEDIA_VARIANTS);

export const MEDIA_MIME = "image/jpeg";

export const MEDIA_LIMITS = {
  /** Bytes of one object (the full image or the thumbnail). */
  maxBytes: 15 * 1024 * 1024,
  /** Pixels on the long edge of the full-size image. */
  fullEdge: 2048,
  /** Pixels on the long edge of the thumbnail. */
  thumbEdge: 512,
  /** Photos attached to one Session. */
  sessionPhotos: 4,
} as const;

/** What one `media` row says about an image; the server validates it, the client mirrors it. */
export const mediaInput = z.strictObject({
  kind: mediaKindSchema,
  mime: z.literal(MEDIA_MIME),
  width: z.number().int().positive().max(MEDIA_LIMITS.fullEdge),
  height: z.number().int().positive().max(MEDIA_LIMITS.fullEdge),
  bytes: z.number().int().positive().max(MEDIA_LIMITS.maxBytes),
  thumb_bytes: z.number().int().positive().max(MEDIA_LIMITS.maxBytes),
});
export type MediaInput = z.infer<typeof mediaInput>;

/** `users/{userId}/{mediaId}.jpg` for the full image, `users/{userId}/{mediaId}_t.jpg` for the thumbnail. */
export function mediaObjectKey(userId: string, mediaId: string, variant: MediaVariant): string {
  return `${mediaUserPrefix(userId)}${mediaId}${variant === "thumb" ? "_t" : ""}.jpg`;
}

/** The prefix every object of one user lives under; account deletion removes all of it. */
export function mediaUserPrefix(userId: string): string {
  return `users/${userId}/`;
}

/** The file name of a variant on a device: the last part of its object key. */
export function mediaFileName(mediaId: string, variant: MediaVariant): string {
  return `${mediaId}${variant === "thumb" ? "_t" : ""}.jpg`;
}

/**
 * The attachment id of a variant in the device's attachment queue: the media id for the full
 * image, the media id and `_t` for the thumbnail.
 */
export function mediaAttachmentId(mediaId: string, variant: MediaVariant): string {
  return variant === "thumb" ? `${mediaId}_t` : mediaId;
}

/** The media id and variant an attachment id stands for, or null if it is not one of ours. */
export function parseMediaAttachmentId(
  attachmentId: string,
): { mediaId: string; variant: MediaVariant } | null {
  const thumb = attachmentId.endsWith("_t");
  const mediaId = thumb ? attachmentId.slice(0, -2) : attachmentId;
  if (!z.uuid().safeParse(mediaId).success) return null;
  return { mediaId, variant: thumb ? "thumb" : "full" };
}

/**
 * The size a picture is scaled to so its long edge is at most `maxEdge`, keeping the aspect
 * ratio and never scaling up. Both sides are at least 1.
 */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
