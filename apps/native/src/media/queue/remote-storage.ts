import type { AttachmentRecord, RemoteStorageAdapter } from "@powersync/common";
import { MEDIA_MIME, parseMediaAttachmentId, type MediaVariant } from "@workspace/shared";

/** The two procedures that sign a URL; the app passes its oRPC client's. */
export type MediaUrls = {
  uploadUrl(input: {
    mediaId: string;
    variant: MediaVariant;
  }): Promise<{ url: string; headers: { "Content-Type": string; "Content-Length": string } }>;
  downloadUrl(input: { mediaId: string; variant: MediaVariant }): Promise<{ url: string }>;
};

/** The part of `fetch` the bucket calls need: the network boundary, replaced in tests. */
export type SendRequest = (
  url: string,
  init: { method: "GET" | "PUT"; headers?: Record<string, string>; body?: ArrayBuffer },
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/** A bucket call that answered with an error status. Carries the status only, never the URL. */
export class MediaTransferError extends Error {
  readonly status: number;
  constructor(action: "upload" | "download", status: number) {
    super(`Media ${action} failed with status ${status}`);
    this.name = "MediaTransferError";
    this.status = status;
  }
}

function target(attachment: AttachmentRecord) {
  const parsed = parseMediaAttachmentId(attachment.id);
  if (!parsed) throw new Error("Not a media attachment");
  return parsed;
}

/**
 * Moves media files between the device and the private bucket through presigned URLs (ADR 0040):
 * ask the API for a signed URL, then talk to the bucket directly. Nothing here deletes remotely:
 * the server removes the objects of deleted media within a day.
 */
export function createRemoteStorage(urls: MediaUrls, send: SendRequest): RemoteStorageAdapter {
  return {
    async uploadFile(fileData, attachment) {
      const { mediaId, variant } = target(attachment);
      const signed = await urls.uploadUrl({ mediaId, variant });
      // The signature covers the type and the length. The length is the body's own: HTTP stacks
      // set it and refuse a hand-written one, so it is not passed along.
      const response = await send(signed.url, {
        method: "PUT",
        headers: { "Content-Type": signed.headers["Content-Type"] ?? MEDIA_MIME },
        body: fileData,
      });
      if (!response.ok) throw new MediaTransferError("upload", response.status);
    },

    async downloadFile(attachment) {
      const { mediaId, variant } = target(attachment);
      const signed = await urls.downloadUrl({ mediaId, variant });
      const response = await send(signed.url, { method: "GET" });
      if (!response.ok) throw new MediaTransferError("download", response.status);
      return response.arrayBuffer();
    },

    async deleteFile() {
      // Objects are deleted by the server's purge job after the media row is deleted.
    },
  };
}
