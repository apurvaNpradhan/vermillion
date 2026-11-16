import { newMediaId } from "@workspace/sync";
import { File, Paths } from "expo-file-system";

import { isInsideRoot } from "@/media/queue/files";
import type { ProcessedImage } from "./process-image";

/**
 * Deletes a file only if it is a copy in the app's own cache folder. The picker hands over a
 * cache copy of the chosen picture, and the manipulator writes its output to the cache too; a
 * user's original (in the photo library, or anywhere else) is never touched. Errors are ignored:
 * the system empties the cache on its own, this only shortens how long a private photo stays
 * there.
 */
export function removeCachedFile(uri: string): void {
  try {
    if (!isInsideRoot(uri, Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort, see above.
  }
}

/**
 * Drops a processed picture that will not be saved: it was replaced, removed, abandoned with its
 * sheet, or its save failed. Private photos should not outlive the screen that held them.
 */
export function discardProcessed(image: Pick<ProcessedImage, "fullUri" | "thumbUri">): void {
  removeCachedFile(image.fullUri);
  removeCachedFile(image.thumbUri);
}

/**
 * Copies a processed picture's files, so the attachment queue can take the copies (it moves the
 * files it is given) while the original stays whole in case saving fails and the user retries.
 */
export function cloneProcessed(image: ProcessedImage): ProcessedImage {
  const id = newMediaId();
  const full = new File(Paths.cache, `${id}.jpg`);
  const thumb = new File(Paths.cache, `${id}_t.jpg`);
  try {
    new File(image.fullUri).copy(full);
    new File(image.thumbUri).copy(thumb);
  } catch (error) {
    discardProcessed({ fullUri: full.uri, thumbUri: thumb.uri });
    throw error;
  }
  return { ...image, fullUri: full.uri, thumbUri: thumb.uri };
}
