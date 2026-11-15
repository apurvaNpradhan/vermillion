import type { AttachmentData, StreamingLocalStorageAdapter } from "@powersync/common";
import { Directory, File, Paths } from "expo-file-system";

import { excludeFromBackup } from "../../modules/vermillion-backup";
import { FULL_FOLDER, MEDIA_DIRECTORY, relativePath, THUMB_FOLDER } from "./files";

const mediaRoot = () => new Directory(Paths.document, MEDIA_DIRECTORY);

function ensureDirectories() {
  const root = mediaRoot();
  root.create({ intermediates: true, idempotent: true });
  for (const folder of [FULL_FOLDER, THUMB_FOLDER]) {
    new Directory(root, folder).create({ intermediates: true, idempotent: true });
  }
  // Private photos stay out of iCloud and iTunes backups (Android's rules back up preferences only).
  excludeFromBackup(root.uri.replace(/^file:\/\//, "").replace(/\/$/, ""));
}

/**
 * Where the attachment queue keeps media files: `documents/media/{full,thumb}/`. Built on
 * `expo-file-system`; `moveFile` lets a processed picture join the queue without being read into
 * memory (`AttachmentQueue.saveFileFromUri`).
 */
export function createLocalMediaStorage(): StreamingLocalStorageAdapter {
  const fileAt = (path: string) => new File(path);
  return {
    async initialize() {
      ensureDirectories();
    },

    getLocalUri: (filename) => new File(Paths.document, relativePath(filename)).uri,

    async saveFile(filePath: string, data: AttachmentData) {
      ensureDirectories();
      const file = fileAt(filePath);
      file.create({ intermediates: true, overwrite: true });
      await file.write(data);
      return file.size;
    },

    async readFile(filePath) {
      return fileAt(filePath).arrayBuffer();
    },

    async deleteFile(filePath) {
      const file = fileAt(filePath);
      if (file.exists) file.delete();
    },

    async fileExists(filePath) {
      return fileAt(filePath).exists;
    },

    async makeDir(path) {
      new Directory(path).create({ intermediates: true, idempotent: true });
    },

    async rmDir(path) {
      const directory = new Directory(path);
      if (directory.exists) directory.delete();
    },

    /** Removes every media file of this device: a wipe (sign-out of the owner, account deletion). */
    async clear() {
      const root = mediaRoot();
      if (root.exists) root.delete();
      ensureDirectories();
    },

    async moveFile(sourceUri, targetUri) {
      if (sourceUri === targetUri) return fileAt(targetUri).size;
      ensureDirectories();
      const source = fileAt(sourceUri);
      const target = fileAt(targetUri);
      await source.move(target, { overwrite: true });
      return target.size;
    },
  };
}
