/** Media files live under `media/` in the documents directory, full images apart from thumbnails. */
export const MEDIA_DIRECTORY = "media";
export const FULL_FOLDER = "full";
export const THUMB_FOLDER = "thumb";

/** The folder a media file belongs in, from its file name: thumbnails end in `_t.jpg`. */
export function folderOf(filename: string): typeof FULL_FOLDER | typeof THUMB_FOLDER {
  return filename.endsWith(`_t.jpg`) ? THUMB_FOLDER : FULL_FOLDER;
}

/** What a media file is called on a device: `<uuid>.jpg` or `<uuid>_t.jpg`. Nothing else. */
const MEDIA_FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$/i;

/** The path of a file relative to the documents directory. Throws for a name that is not ours. */
export function relativePath(filename: string): string {
  if (!MEDIA_FILE_NAME.test(filename)) throw new Error("Not a media file name");
  return `${MEDIA_DIRECTORY}/${folderOf(filename)}/${filename}`;
}

function segments(path: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path.replace(/^file:\/\//, ""));
  } catch {
    return null;
  }
  const resolved: string[] = [];
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved;
}

/**
 * Whether `path` (a path or `file://` URI) is a file strictly inside `root`, once `.` and `..`
 * (also percent-encoded) are resolved. The queue's file system adapter only touches such paths.
 */
export function isInsideRoot(path: string, root: string): boolean {
  const target = segments(path);
  const base = segments(root);
  if (!target || !base) return false;
  return target.length > base.length && base.every((part, index) => target[index] === part);
}

/** The folder Program covers were stored in before they were media (ADR 0036); deleted once. */
export const LEGACY_COVER_DIRECTORY = "program-covers";
/** Device-storage flag: the legacy cover folder has been removed. */
export const LEGACY_COVERS_REMOVED_KEY = "vermillion.media.legacy-covers-removed";
