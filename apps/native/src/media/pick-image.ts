import { processImage, type ProcessedImage } from "./process-image";

const SQUARE: [number, number] = [1, 1];

/** The camera permission was refused, so there is no picture: the caller says how to allow it. */
export class CameraDeniedError extends Error {
  constructor() {
    super("The camera permission was refused");
    this.name = "CameraDeniedError";
  }
}

/**
 * Opens the system photo picker (or, with `source: "camera"`, the system camera) and returns the
 * chosen picture, processed for upload, or null when the user cancelled. The system picker needs
 * no permission; the camera asks for its own and throws `CameraDeniedError` when refused.
 * `square` asks for a 1:1 crop; a picker that ignored it is centre-cropped when processed.
 */
export async function pickImage(options: {
  square: boolean;
  source?: "library" | "camera";
}): Promise<ProcessedImage | null> {
  // Loaded on demand: the native module is only needed once the user picks a photo.
  const picker = await import("expo-image-picker");
  const request = {
    mediaTypes: ["images"],
    allowsEditing: options.square,
    ...(options.square ? { aspect: SQUARE } : {}),
    quality: 1,
  } satisfies Parameters<typeof picker.launchImageLibraryAsync>[0];
  if (options.source === "camera") {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraDeniedError();
  }
  const picked =
    options.source === "camera"
      ? await picker.launchCameraAsync(request)
      : await picker.launchImageLibraryAsync(request);
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  return processImage(asset, options);
}
