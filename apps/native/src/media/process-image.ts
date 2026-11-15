import { MEDIA_LIMITS } from "@workspace/shared";
import { File } from "expo-file-system";

import { FULL_QUALITY, planImage, THUMB_QUALITY } from "./plan-image";
import { removeCachedFile } from "./processed-files";

/** A picked or captured picture, re-encoded for upload (ADR 0040). The files are in the cache. */
export type ProcessedImage = {
  fullUri: string;
  thumbUri: string;
  width: number;
  height: number;
  bytes: number;
  thumbBytes: number;
};

/**
 * Re-encodes a picture on the device: a JPEG with a 2048 px long edge and a 512 px thumbnail.
 * Rendering from decoded pixels drops EXIF, location included, and the server never sees the
 * original. `square` cuts the centred square first (covers, avatars).
 */
export async function processImage(
  source: { uri: string; width: number; height: number },
  options: { square: boolean },
): Promise<ProcessedImage> {
  // Loaded on demand: the native module is only needed once the user picks a photo.
  const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
  const plan = planImage(source.width, source.height, options.square);

  const render = async (size: { width: number; height: number }, quality: number) => {
    const context = ImageManipulator.manipulate(source.uri);
    if (plan.crop) context.crop(plan.crop);
    context.resize(size);
    const image = await context.renderAsync();
    return image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  };

  const rendered: string[] = [];
  try {
    const full = await render(plan.full, FULL_QUALITY);
    rendered.push(full.uri);
    const thumb = await render(plan.thumb, THUMB_QUALITY);
    rendered.push(thumb.uri);
    const bytes = new File(full.uri).size;
    const thumbBytes = new File(thumb.uri).size;
    if (bytes <= 0 || bytes > MEDIA_LIMITS.maxBytes || thumbBytes <= 0) {
      throw new Error("The image could not be prepared");
    }
    return {
      fullUri: full.uri,
      thumbUri: thumb.uri,
      width: full.width,
      height: full.height,
      bytes,
      thumbBytes,
    };
  } catch (error) {
    // Nothing is returned, so nobody else will ever drop what was rendered.
    for (const uri of rendered) removeCachedFile(uri);
    throw error;
  } finally {
    // The source still holds the original's EXIF, location included: it never outlives this call.
    // Only the app's own cache copy is deleted, never the user's library original.
    removeCachedFile(source.uri);
  }
}
