/** Media files live under `media/` in the documents directory, full images apart from thumbnails. */
export const MEDIA_DIRECTORY = "media";
export const FULL_FOLDER = "full";
export const THUMB_FOLDER = "thumb";

/** The folder a media file belongs in, from its file name: thumbnails end in `_t.jpg`. */
export function folderOf(filename: string): typeof FULL_FOLDER | typeof THUMB_FOLDER {
  return filename.endsWith(`_t.jpg`) ? THUMB_FOLDER : FULL_FOLDER;
}

/** The path of a file relative to the documents directory. */
export function relativePath(filename: string): string {
  return `${MEDIA_DIRECTORY}/${folderOf(filename)}/${filename}`;
}

/** The folder Program covers were stored in before they were media (ADR 0036); deleted once. */
export const LEGACY_COVER_DIRECTORY = "program-covers";
/** Device-storage flag: the legacy cover folder has been removed. */
export const LEGACY_COVERS_REMOVED_KEY = "vermillion.media.legacy-covers-removed";
