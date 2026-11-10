import { COVER_QUALITY, centredSquare, coverSide } from "./cover-names";

/**
 * Opens the system picker with a 1:1 crop and returns the chosen picture as a square JPEG of at
 * most 1024 px in the cache, or null when the user cancelled. The system photo picker needs no
 * permission. A picker that ignored the square crop is centre-cropped here.
 */
export async function pickCoverImage(): Promise<string | null> {
  // Loaded on demand: these native modules are only needed once the user picks a photo.
  const [{ launchImageLibraryAsync }, { ImageManipulator, SaveFormat }] = await Promise.all([
    import("expo-image-picker"),
    import("expo-image-manipulator"),
  ]);
  const picked = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  const square = centredSquare(asset.width, asset.height);
  if (square) context.crop(square);
  const side = coverSide(Math.min(asset.width, asset.height));
  context.resize({ width: side, height: side });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: COVER_QUALITY });
  return saved.uri;
}
