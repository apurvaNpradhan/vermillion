import type { AttachmentData } from "@powersync/common";
import { Directory, File, Paths } from "expo-file-system";

import { excludeFromBackup } from "../../modules/vermillion-backup";
import type { MediaLocalStorage } from "./attachment-queue";
import { FULL_FOLDER, isInsideRoot, MEDIA_DIRECTORY, relativePath, THUMB_FOLDER } from "./files";

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
export function createLocalMediaStorage(): MediaLocalStorage {
  // Every path the queue hands over lies inside the media folder; one that does not is refused.
  const fileAt = (path: string) => {
    if (!isInsideRoot(path, mediaRoot().uri))
      throw new Error("The path is outside the media folder");
    return new File(path);
  };
  // The source of a move is the picker's file, outside the folder; only the target is checked.
  const anywhere = (path: string) => new File(path);
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

    async fileSize(uri) {
      const file = fileAt(uri);
      return file.exists ? file.size : null;
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
      const source = anywhere(sourceUri);
      const target = fileAt(targetUri);
      await source.move(target, { overwrite: true });
      return target.size;
    },
  };
}
