import { AttachmentState } from "@powersync/common";

/** What a view of one media file can show (ADR 0040). */
export type MediaFileState = "local" | "uploading" | "downloading" | "failed" | "missing";

/** The row of one media file: the media itself and the queue's record of the file, if any. */
export type MediaFileRow = {
  /** False when no `media` row exists on this device (not synced yet, or deleted). */
  mediaPresent: boolean;
  /** `attachments.state`, or null when the queue has no record of the file. */
  state: number | null;
  localUri: string | null;
};

export type MediaFile = { uri: string | null; state: MediaFileState };

/**
 * Turns the queue's record into what a view shows. A file that is on the device is `local` (the
 * file itself is the truth), an upload in progress shows the local file with `uploading`, and a
 * file that is not here yet is `downloading` until a transfer failed, which is `failed` (retry).
 */
export function mediaFile(row: MediaFileRow, failed: boolean): MediaFile {
  if (!row.mediaPresent) return { uri: null, state: "missing" };
  switch (row.state) {
    case AttachmentState.SYNCED:
      return { uri: row.localUri, state: row.localUri === null ? "downloading" : "local" };
    case AttachmentState.QUEUED_UPLOAD:
      return { uri: row.localUri, state: failed ? "failed" : "uploading" };
    case AttachmentState.QUEUED_DELETE:
      return { uri: null, state: "missing" };
    default:
      // No record yet, queued for download, or archived: the file is on its way.
      return { uri: null, state: failed ? "failed" : "downloading" };
  }
}
