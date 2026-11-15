import { processImage, type ProcessedImage } from "./process-image";

const SQUARE: [number, number] = [1, 1];

/**
 * Opens the system photo picker and returns the chosen picture, processed for upload, or null
 * when the user cancelled. The system picker needs no permission. `square` asks the picker for a
 * 1:1 crop; a picker that ignored it is centre-cropped when processed.
 */
export async function pickImage(options: { square: boolean }): Promise<ProcessedImage | null> {
  // Loaded on demand: the native module is only needed once the user picks a photo.
  const { launchImageLibraryAsync } = await import("expo-image-picker");
  const picked = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: options.square,
    ...(options.square ? { aspect: SQUARE } : {}),
    quality: 1,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  return processImage(asset, options);
}
