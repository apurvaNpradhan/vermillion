import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import { MEDIA_MIME, mediaInput, type MediaKind } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { media } from "./tables";

export type MediaDatabase = AbstractPowerSyncDatabase;

/** Columns of `media` the server accepts in an upload; the rest are written locally only. */
export const mediaUploadColumns: ReadonlySet<string> = new Set([
  "kind",
  "mime",
  "width",
  "height",
  "bytes",
  "thumb_bytes",
]);

/** What a device knows about an image it just processed. */
export type NewMedia = {
  /** Made before the files are named after it; a fresh UUIDv7 when absent. */
  id?: string;
  kind: MediaKind;
  width: number;
  height: number;
  bytes: number;
  thumbBytes: number;
};

/** A media id for files that are written before their row (the files carry the id in their names). */
export const newMediaId = (): string => uuidv7();

const clients = new WeakMap<MediaDatabase, ReturnType<typeof open>>();

function open(database: MediaDatabase) {
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema });
}

function localMedia(database: MediaDatabase) {
  const existing = clients.get(database);
  if (existing) return existing;
  const created = open(database);
  clients.set(database, created);
  return created;
}

export type MediaTx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];

/** Runs a media write in the SQLite write transaction, after the write-scope check (ADR 0021). */
export function writeMedia<T>(
  database: MediaDatabase,
  expectedInstallId: string | undefined,
  run: (tx: MediaTx) => Promise<T>,
): Promise<T> {
  return localMedia(database).transaction(async (tx) => {
    if (expectedInstallId !== undefined) {
      const [install] = await tx
        .select({ id: installMeta.id })
        .from(installMeta)
        .where(eq(installMeta.install_id, expectedInstallId))
        .limit(1);
      if (!install) throw new Error("The device account changed; reopen the screen");
    }
    return run(tx);
  });
}

/**
 * Writes the row of a new media inside a transaction the caller owns, so a reference to it can be
 * written in the same one. Returns the id. Validates what the server validates.
 */
export async function insertMedia(tx: MediaTx, input: NewMedia): Promise<string> {
  const values = mediaInput.parse({
    kind: input.kind,
    mime: MEDIA_MIME,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    thumb_bytes: input.thumbBytes,
  });
  const [owner] = await tx
    .select({ userId: deviceOwner.user_id })
    .from(deviceOwner)
    .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
    .limit(1);
  if (!owner) throw new Error("No Device owner: sign in first");
  const id = input.id ?? uuidv7();
  await tx
    .insert(media)
    .values({ id, user_id: owner.userId, ...values, created_at: new Date().toISOString() });
  return id;
}

/** Deletes a media row inside a caller's transaction; uploads as a soft delete. False if absent. */
export async function removeMedia(tx: MediaTx, id: string): Promise<boolean> {
  const removed = await tx.delete(media).where(eq(media.id, id)).returning({ id: media.id });
  return removed.length > 0;
}

/**
 * Creates a media for the Device owner; it uploads as a PUT. The row renders at once from the
 * local file. The caller keeps what points at it in the same transaction when it can (see
 * `setProgramCoverToNewMedia`), and hands the files to the attachment queue.
 */
export function createMedia(
  database: MediaDatabase,
  input: NewMedia,
  expectedInstallId?: string,
): Promise<string> {
  return writeMedia(database, expectedInstallId, (tx) => insertMedia(tx, input));
}

/** Deletes a media (a soft delete on the server). Returns false if it was already gone. */
export function deleteMedia(
  database: MediaDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return writeMedia(database, expectedInstallId, (tx) => removeMedia(tx, id));
}
