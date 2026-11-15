import {
  AttachmentQueue,
  AttachmentState,
  attachmentFromSql,
  type AttachmentContext,
  type AttachmentErrorHandler,
  type AttachmentRecord,
  type AttachmentTransportAdapter,
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
import { createRemoteStorage, type MediaUrls, type SendRequest } from "./remote-storage";
import {
  cancellable,
  createTransferGate,
  MediaNotCommitted,
  TransferCancelled,
  type TransferGate,
} from "./transfer-gate";

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

/** The queue's file system: the streaming adapter, and the size of a file on disk. */
export type MediaLocalStorage = StreamingLocalStorageAdapter & {
  /** Bytes of the file at `uri`, or null when it is not there. */
  fileSize(uri: string): Promise<number | null>;
};

export type MediaQueueOptions = {
  /** Cap of the full-size image cache; tests lower it. */
  fullCacheBytes?: number;
  /** How long staged files may wait for their media row before they are given up. */
  stagingGraceMs?: number;
};

/**
 * Files are saved before the transaction that writes their media row. They wait this long for
 * that row; past it they are orphans (a crash or a failed write) and are dropped.
 */
export const STAGING_GRACE_MS = 10 * 60 * 1000;

export type MediaQueue = {
  /** Starts the queue: uploads what this device made, downloads thumbnails and wanted images. */
  start(): Promise<void>;
  /**
   * Stops the queue and resolves once nothing is in flight: transfers still waiting on the network
   * are cancelled, and none can write a file or a record afterwards.
   */
  stop(): Promise<void>;
  /**
   * Hands the two processed files of a new media to the queue. They are kept, and upload once the
   * `media` row exists on this device: call it before the transaction that writes the row.
   */
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
  /** Stops, then removes every file and record: the device is wiped. */
  clear(): Promise<void>;
};

/**
 * PowerSync's queue, with every batch of transfers tracked, so a stop can wait for the one in
 * flight, and with the full-image cache trimmed after each batch (downloads and uploads both add
 * to it).
 */
class TrackedQueue extends AttachmentQueue<MediaLocalStorage> {
  private readonly running = new Set<Promise<void>>();
  /** Runs after a batch, while the queue is still started. */
  afterBatch: () => Promise<void> = async () => undefined;
  gate: TransferGate | null = null;

  override async syncStorage(): Promise<void> {
    const signal = this.gate?.signal;
    const run = (async () => {
      await super.syncStorage();
      if (signal && !signal.aborted) await this.afterBatch();
    })();
    this.running.add(run);
    try {
      await run;
    } finally {
      this.running.delete(run);
    }
  }

  /** Resolves when every batch that was running has finished. */
  async drain(): Promise<void> {
    await Promise.allSettled(this.running);
  }
}

/**
 * The attachment queue of user media (ADR 0040): PowerSync's `AttachmentQueue` with our file
 * system and bucket adapters, over the local `attachments` table. The queue never deletes in the
 * bucket (the server does). Create one per database.
 *
 * Lifecycle: `start` and `stop` are serialized, and `stop` and `clear` wait for the transfer in
 * flight, so a wipe or an account switch never races a transfer: a download that finishes after
 * it cannot recreate a file or a record for the previous account.
 */
export function createMediaQueue(
  database: CommonPowerSyncDatabase,
  urls: MediaUrls,
  send: SendRequest,
  storage: MediaLocalStorage,
  options: MediaQueueOptions = {},
): MediaQueue {
  const fullCacheBytes = options.fullCacheBytes ?? FULL_CACHE_BYTES;
  const stagingGraceMs = options.stagingGraceMs ?? STAGING_GRACE_MS;
  const failures = createFailureTracker();
  const gate = createTransferGate();
  const remote = createRemoteStorage(urls, send);

  const hasMediaRow = async (attachmentId: string) => {
    const parsed = parseMediaAttachmentId(attachmentId);
    if (!parsed) return false;
    const row = await database.getOptional("SELECT id FROM media WHERE id = ?", [parsed.mediaId]);
    return row !== null;
  };

  /** A transfer is only worth retrying while the media still exists on this device. */
  const mediaStillWanted = (attachment: AttachmentRecord) => hasMediaRow(attachment.id);

  /**
   * Cancellation and staging live in the transport: a transfer that is cancelled never writes, and
   * an upload waits for its media row (the files of a new media are saved before that row).
   */
  const transport: AttachmentTransportAdapter = {
    async upload(attachment) {
      const signal = gate.signal;
      if (!(await hasMediaRow(attachment.id))) throw new MediaNotCommitted();
      const data = await cancellable(signal, () => storage.readFile(attachment.localUri));
      await cancellable(signal, () => remote.uploadFile(data, attachment));
    },
    async download(attachment) {
      const signal = gate.signal;
      const data = await cancellable(signal, () => remote.downloadFile(attachment));
      // The answer came back after a stop: it belongs to a generation that is over.
      if (signal.aborted) throw new TransferCancelled();
      await storage.saveFile(attachment.localUri, data);
    },
    async delete(attachment) {
      await remote.deleteFile(attachment);
    },
  };

  const errorHandler: AttachmentErrorHandler = {
    async onUploadError(attachment, error) {
      // Stopped, not failed: the record stays queued for the next start.
      if (error instanceof TransferCancelled) return true;
      // Staged: wait for the media row, unless it never came (a crash, a failed write).
      if (error instanceof MediaNotCommitted) {
        return Date.now() - (attachment.timestamp ?? 0) < stagingGraceMs;
      }
      // Offline is a state, not a failure: the next attempt (or the connection) tries again.
      if (!(error instanceof Error && isNetworkError(error))) failures.record(attachment.id);
      return mediaStillWanted(attachment);
    },
    async onDownloadError(attachment, error) {
      if (error instanceof TransferCancelled) return true;
      if (!(error instanceof Error && isNetworkError(error))) failures.record(attachment.id);
      return mediaStillWanted(attachment);
    },
    // Remote deletes are not used.
    onDeleteError: async () => false,
  };

  /** Media ids already shown to the queue in this run; a new one means an upload may be ready. */
  const announced = new Set<string>();

  // The watch handler and `wantFull` take turns. The handler archives every record that is not in
  // the list it was given, so a list read before `wantFull` wrote its record must not be applied
  // after it: the list is read again, inside the turn.
  let turns: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const run = turns.then(work);
    turns = run.catch(() => undefined);
    return run;
  };

  const queue = new TrackedQueue({
    db: database,
    localStorage: storage,
    transportAdapter: transport,
    errorHandler,
    // Archived files are deleted at once: nothing is kept for a restore.
    archivedCacheLimit: 0,
    watchAttachments: (onUpdate, signal) => {
      const apply = async () => {
        let fresh = false;
        await inTurn(async () => {
          const items: WatchedAttachmentItem[] = idRows
            .parse(await database.getAll(WATCHED_MEDIA_SQL))
            .map((row) => ({ id: row.id, fileExtension: "jpg", mediaType: MEDIA_MIME }));
          for (const item of items) {
            if (!announced.has(item.id)) fresh = true;
            announced.add(item.id);
          }
          await onUpdate(items);
        });
        // A media row that just appeared may be the one a staged upload was waiting for.
        if (fresh) await queue.syncStorage();
      };
      database.watchWithCallback(
        WATCHED_MEDIA_SQL,
        [],
        { onResult: () => void apply().catch(() => undefined), onError: () => undefined },
        { signal, tables: ["media", "attachments"] },
      );
    },
  });
  queue.gate = gate;

  /** The record of one attachment, or undefined. (`getAttachment` of PowerSync throws on none.) */
  async function recordOf(context: AttachmentContext, id: string) {
    const row = await context.db.getOptional("SELECT * FROM attachments WHERE id = ?", [id]);
    return row ? attachmentFromSql(row) : undefined;
  }

  /** Persists the byte size of synced files that have none: downloads do not record it. */
  async function recordSizes() {
    const missing = z
      .array(z.object({ id: z.string(), local_uri: z.string() }))
      .parse(
        await database.getAll(
          "SELECT id, local_uri FROM attachments WHERE state = ? AND size IS NULL AND local_uri IS NOT NULL",
          [AttachmentState.SYNCED],
        ),
      );
    for (const { id, local_uri } of missing) {
      const size = await storage.fileSize(local_uri);
      if (size !== null)
        await database.execute("UPDATE attachments SET size = ? WHERE id = ?", [size, id]);
    }
  }

  async function trimFullCache() {
    await recordSizes();
    const cached = cachedRows.parse(
      await database.getAll(
        `SELECT id, size FROM attachments WHERE state = ? AND id NOT LIKE '%\\_t' ESCAPE '\\'
         ORDER BY timestamp DESC`,
        [AttachmentState.SYNCED],
      ),
    );
    const evict = fullImagesToEvict(cached, fullCacheBytes);
    if (evict.length === 0) return;
    await database.execute(
      `UPDATE attachments SET state = ? WHERE id IN (SELECT value FROM json_each(?))`,
      [AttachmentState.ARCHIVED, JSON.stringify(evict)],
    );
    await queue.expireCache();
  }
  queue.afterBatch = trimFullCache;

  // start, stop and clear run one at a time, in the order they were asked for.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work);
    chain = run.catch(() => undefined);
    return run;
  };
  let started = false;

  async function halt() {
    gate.close();
    started = false;
    await queue.stopSync();
    await queue.drain();
  }

  return {
    failures,

    start: () =>
      serial(async () => {
        if (started) return;
        announced.clear();
        gate.open();
        started = true;
        try {
          await queue.startSync();
          await trimFullCache();
        } catch (error) {
          await halt().catch(() => undefined);
          throw error;
        }
      }),

    stop() {
      // In-flight transfers are released now; the rest waits its turn behind a pending start.
      gate.close();
      return serial(halt);
    },

    async addFiles(mediaId, files) {
      // Files first, row after. The records wait (see `transport.upload`) until the media row is
      // written; a failure or a crash before it leaves them to be dropped as orphans.
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
          const record = await recordOf(context, id);
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
      await inTurn(() =>
        queue.withAttachmentContext(async (context) => {
          const existing = await recordOf(context, id);
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
        }),
      );
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

    clear() {
      gate.close();
      return serial(async () => {
        await halt();
        await queue.clearQueue();
      });
    },
  };
}
