import {
  AttachmentQueue,
  AttachmentState,
  type AttachmentErrorHandler,
  type AttachmentRecord,
  type CommonPowerSyncDatabase,
  type StreamingLocalStorageAdapter,
  type WatchedAttachmentItem,
} from "@powersync/common";
import {
  MEDIA_MIME,
  mediaAttachmentId,
  mediaFileName,
  parseMediaAttachmentId,
} from "@workspace/shared";
import { isNetworkError } from "@workspace/client/network-error";
import { z } from "zod";

import { createFailureTracker, type FailureTracker } from "./failures";
import { createLocalMediaStorage } from "./local-storage";
import { createRemoteStorage, type MediaUrls, type SendRequest } from "./remote-storage";

/** Full-size images kept on the device besides the originals still uploading: least recently opened go first. */
export const FULL_CACHE_BYTES = 300 * 1024 * 1024;

/**
 * Every live `media` row gives its thumbnail (eager, on every device of the owner). A full image
 * is watched only once the queue has a record of it: the device made it (it uploads), or a view
 * asked for it (`wantFull`). One that is evicted is archived and drops out of the list.
 */
export const WATCHED_MEDIA_SQL = `SELECT id || '_t' AS id FROM media
  UNION ALL
  SELECT m.id AS id FROM media m
    JOIN attachments a ON a.id = m.id
    WHERE a.state != ${AttachmentState.ARCHIVED}`;

const idRows = z.array(z.object({ id: z.string() }));
const cachedRows = z.array(z.object({ id: z.string(), size: z.number().nullable() }));

/** Which cached full images to give up: the least recently opened beyond `capBytes`. */
export function fullImagesToEvict(
  cached: readonly { id: string; size: number | null }[],
  capBytes: number,
): string[] {
  const evict: string[] = [];
  let total = 0;
  for (const file of cached) {
    total += file.size ?? 0;
    if (total > capBytes) evict.push(file.id);
  }
  return evict;
}

export type MediaQueue = {
  /** Starts the queue: uploads what this device made, downloads thumbnails and wanted images. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Hands the two processed files of a new media to the queue, to upload when it can. */
  addFiles(mediaId: string, files: { fullUri: string; thumbUri: string }): Promise<void>;
  /** Drops the files and records of a media that was deleted or replaced, at once. */
  discard(mediaId: string): Promise<void>;
  /** A view opened the full image: download it if this device has not got it. */
  wantFull(mediaId: string): Promise<void>;
  /** The full image was shown: it is the most recently used. */
  touchFull(mediaId: string): Promise<void>;
  /** Tries a failed transfer again now. */
  retry(attachmentId: string): Promise<void>;
  /** Files whose last transfer failed, for views that offer Retry. */
  failures: FailureTracker;
  /** Removes every file and record: the device is wiped. */
  clear(): Promise<void>;
};

/**
 * The attachment queue of user media (ADR 0040): PowerSync's `AttachmentQueue` with our file
 * system and bucket adapters, over the local `attachments` table. The queue never deletes in the
 * bucket (the server does). Create one per database.
 */
export function createMediaQueue(
  database: CommonPowerSyncDatabase,
  urls: MediaUrls,
  send: SendRequest,
  storage: StreamingLocalStorageAdapter = createLocalMediaStorage(),
): MediaQueue {
  const failures = createFailureTracker();

  /** A transfer is only worth retrying while the media still exists on this device. */
  async function mediaStillWanted(attachment: AttachmentRecord) {
    const parsed = parseMediaAttachmentId(attachment.id);
    if (!parsed) return false;
    const row = await database.getOptional("SELECT id FROM media WHERE id = ?", [parsed.mediaId]);
    return row !== null;
  }

  const errorHandler: AttachmentErrorHandler = {
    async onUploadError(attachment, error) {
      // Offline is a state, not a failure: the next attempt (or the connection) tries again.
      if (!(error instanceof Error && isNetworkError(error))) failures.record(attachment.id);
      return mediaStillWanted(attachment);
    },
    async onDownloadError(attachment, error) {
      if (!(error instanceof Error && isNetworkError(error))) failures.record(attachment.id);
      return mediaStillWanted(attachment);
    },
    // Remote deletes are not used.
    onDeleteError: async () => false,
  };

  const queue = new AttachmentQueue({
    db: database,
    localStorage: storage,
    remoteStorage: createRemoteStorage(urls, send),
    errorHandler,
    // Archived files are deleted at once: nothing is kept for a restore.
    archivedCacheLimit: 0,
    watchAttachments: (onUpdate, signal) => {
      database.watchWithCallback(
        WATCHED_MEDIA_SQL,
        [],
        {
          onResult: (result) => {
            const items: WatchedAttachmentItem[] = idRows
              .parse(result.array)
              .map((row) => ({ id: row.id, fileExtension: "jpg", mediaType: MEDIA_MIME }));
            void onUpdate(items);
          },
          onError: () => undefined,
        },
        { signal, tables: ["media", "attachments"] },
      );
    },
  });

  let started = false;

  async function trimFullCache() {
    const cached = cachedRows.parse(
      await database.getAll(
        `SELECT id, size FROM attachments WHERE state = ? AND id NOT LIKE '%\\_t' ESCAPE '\\'
         ORDER BY timestamp DESC`,
        [AttachmentState.SYNCED],
      ),
    );
    const evict = fullImagesToEvict(cached, FULL_CACHE_BYTES);
    if (evict.length === 0) return;
    await database.execute(
      `UPDATE attachments SET state = ? WHERE id IN (SELECT value FROM json_each(?))`,
      [AttachmentState.ARCHIVED, JSON.stringify(evict)],
    );
    await queue.expireCache();
  }

  return {
    failures,

    async start() {
      if (started) return;
      started = true;
      try {
        await queue.startSync();
        await trimFullCache();
      } catch (error) {
        started = false;
        throw error;
      }
    },

    async stop() {
      if (!started) return;
      started = false;
      await queue.stopSync();
    },

    async addFiles(mediaId, files) {
      // Files first, row after: the queue keeps an unreferenced upload until its media row exists,
      // while a media row without its thumbnail record would be queued for download.
      try {
        await queue.saveFileFromUri({
          id: mediaAttachmentId(mediaId, "full"),
          localUri: files.fullUri,
          fileExtension: "jpg",
          mediaType: MEDIA_MIME,
        });
        await queue.saveFileFromUri({
          id: mediaAttachmentId(mediaId, "thumb"),
          localUri: files.thumbUri,
          fileExtension: "jpg",
          mediaType: MEDIA_MIME,
        });
      } catch (error) {
        await this.discard(mediaId).catch(() => undefined);
        throw error;
      }
    },

    async discard(mediaId) {
      const ids = [mediaAttachmentId(mediaId, "full"), mediaAttachmentId(mediaId, "thumb")];
      await queue.withAttachmentContext(async (context) => {
        const archived: AttachmentRecord[] = [];
        for (const id of ids) {
          failures.clear(id);
          const record = await context.getAttachment(id);
          if (record) archived.push({ ...record, state: AttachmentState.ARCHIVED });
        }
        await context.saveAttachments(archived);
      });
      await queue.expireCache();
      // A file saved without a record (a crash between the two) is removed too.
      for (const id of ids) {
        const parsed = parseMediaAttachmentId(id);
        if (!parsed) continue;
        const uri = storage.getLocalUri(mediaFileName(parsed.mediaId, parsed.variant));
        if (await storage.fileExists(uri)) await storage.deleteFile(uri);
      }
    },

    async wantFull(mediaId) {
      const id = mediaAttachmentId(mediaId, "full");
      await queue.withAttachmentContext(async (context) => {
        const existing = await context.getAttachment(id);
        if (existing && existing.state !== AttachmentState.ARCHIVED) return;
        await context.saveAttachments([
          {
            id,
            filename: mediaFileName(mediaId, "full"),
            state: AttachmentState.QUEUED_DOWNLOAD,
            hasSynced: false,
            mediaType: MEDIA_MIME,
            timestamp: Date.now(),
          },
        ]);
      });
    },

    async touchFull(mediaId) {
      await database.execute("UPDATE attachments SET timestamp = ? WHERE id = ? AND state = ?", [
        Date.now(),
        mediaAttachmentId(mediaId, "full"),
        AttachmentState.SYNCED,
      ]);
      await trimFullCache();
    },

    async retry(attachmentId) {
      failures.retrying(attachmentId);
      await queue.syncStorage();
    },

    async clear() {
      await this.stop();
      await queue.clearQueue();
    },
  };
}
