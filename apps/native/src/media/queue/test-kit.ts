import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { AttachmentData } from "@powersync/common";
import { PowerSyncDatabase } from "@powersync/node";
import { claimDeviceOwner, powerSyncSchema } from "@workspace/sync";

import type { MediaLocalStorage } from "./attachment-queue";
import { FULL_FOLDER, MEDIA_DIRECTORY, relativePath, THUMB_FOLDER } from "./files";
import type { MediaUrls, SendRequest } from "./remote-storage";

/**
 * Test doubles for the attachment queue, at the platform boundaries only: a real PowerSync
 * database (a SQLite file), a file system adapter over a temporary directory, and a bucket whose
 * network calls the test holds and answers. The queue itself is always the real one.
 */

/** A real PowerSync database with the app's schema, owned by `ownerId`, in a temporary folder. */
export async function createTestDatabase(ownerId = "user-a") {
  const directory = mkdtempSync(join(tmpdir(), "vermillion-media-db-"));
  const database = new PowerSyncDatabase({
    schema: powerSyncSchema,
    database: { dbFilename: "test.db", dbLocation: directory },
  });
  await database.init();
  await claimDeviceOwner(database, ownerId);
  return {
    database,
    async close() {
      await database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** The media file system over a temporary directory, shaped like `createLocalMediaStorage`. */
export function createDiskStorage(
  options: { failDeleteOf?: (uri: string) => boolean } = {},
): MediaLocalStorage & { root: string; files(): string[]; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "vermillion-media-files-"));
  const ensure = () => {
    for (const folder of [FULL_FOLDER, THUMB_FOLDER]) {
      mkdirSync(join(root, MEDIA_DIRECTORY, folder), { recursive: true });
    }
  };
  const listed = (folder: string) => {
    const directory = join(root, MEDIA_DIRECTORY, folder);
    if (!existsSync(directory)) return [];
    return readdirSync(directory).map((name) => `${folder}/${name}`);
  };
  return {
    root,
    files: () => [...listed(FULL_FOLDER), ...listed(THUMB_FOLDER)].sort(),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    async initialize() {
      ensure();
    },
    getLocalUri: (filename) => join(root, relativePath(filename)),
    async saveFile(path: string, data: AttachmentData) {
      mkdirSync(dirname(path), { recursive: true });
      const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data, "base64");
      writeFileSync(path, bytes);
      return bytes.byteLength;
    },
    async readFile(path) {
      const bytes = readFileSync(path);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async deleteFile(path) {
      if (options.failDeleteOf?.(path)) throw new Error("The file system refused the delete");
      rmSync(path, { force: true });
    },
    async fileExists(path) {
      return existsSync(path);
    },
    async fileSize(path) {
      return existsSync(path) ? statSync(path).size : null;
    },
    async makeDir(path) {
      mkdirSync(path, { recursive: true });
    },
    async rmDir(path) {
      rmSync(path, { recursive: true, force: true });
    },
    async clear() {
      rmSync(join(root, MEDIA_DIRECTORY), { recursive: true, force: true });
      ensure();
    },
    async moveFile(source, target) {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
      return statSync(target).size;
    },
  };
}

/** A processed picture waiting outside the media directory, as `pickImage` leaves it. */
export function writePickedFiles(
  directory: string,
  name: string,
  sizes: { full: number; thumb: number },
) {
  mkdirSync(directory, { recursive: true });
  const fullUri = join(directory, `${name}.jpg`);
  const thumbUri = join(directory, `${name}_t.jpg`);
  writeFileSync(fullUri, new Uint8Array(sizes.full).fill(1));
  writeFileSync(thumbUri, new Uint8Array(sizes.thumb).fill(2));
  return { fullUri, thumbUri };
}

type HeldGet = { variant: string; release(bytes: number): void; fail(): void };

/**
 * The bucket and the two signing procedures. Downloads are answered at once with `bytes` of the
 * variant, or held until the test releases them. The `server` set stands for the media rows the
 * API has: signing an upload for any other media is `NOT_FOUND`, like the real procedure.
 */
export function createFakeBucket(
  options: { fullBytes?: number; thumbBytes?: number; hold?: boolean } = {},
) {
  const server = new Set<string>();
  const puts: string[] = [];
  const signedUploads: string[] = [];
  const held: HeldGet[] = [];
  let hold = options.hold ?? false;
  const fullBytes = options.fullBytes ?? 100;
  const thumbBytes = options.thumbBytes ?? 10;

  const urls: MediaUrls = {
    async uploadUrl({ mediaId, variant }) {
      signedUploads.push(`${mediaId}:${variant}`);
      if (!server.has(mediaId)) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      return {
        url: `https://bucket.example/put/${mediaId}/${variant}`,
        headers: { "Content-Type": "image/jpeg", "Content-Length": "1" },
      };
    },
    async downloadUrl({ mediaId, variant }) {
      return { url: `https://bucket.example/get/${mediaId}/${variant}` };
    },
  };

  const send: SendRequest = (url, init) => {
    const variant = url.endsWith("/thumb") ? "thumb" : "full";
    if (init.method === "PUT") {
      puts.push(url.replace("https://bucket.example/put/", ""));
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      });
    }
    const bytes = variant === "thumb" ? thumbBytes : fullBytes;
    const answer = (length: number) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(length).fill(9).buffer,
    });
    if (!hold) return Promise.resolve(answer(bytes));
    return new Promise((resolve, reject) => {
      held.push({
        variant,
        release: (length) => resolve(answer(length)),
        fail: () => reject(new Error("socket closed")),
      });
    });
  };

  return {
    urls,
    send,
    server,
    puts,
    signedUploads,
    held,
    holdDownloads: (value: boolean) => {
      hold = value;
    },
  };
}

/** Polls until `check` holds, for work the queue does in the background. */
export async function eventually(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("Timed out waiting for the queue");
}

/** Lets the queue run for a moment when the test expects nothing to happen. */
export const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
