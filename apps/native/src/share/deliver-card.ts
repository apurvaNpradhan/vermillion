import { Asset, getPermissionsAsync, requestPermissionsAsync } from "expo-media-library";
import { shareAsync } from "expo-sharing";

import type { CapturedCard } from "./capture-card";

export type SaveResult = "saved" | "denied";

/**
 * Save to Photos: add-only access, asked the first time. Android 13+ needs no permission to add
 * and answers granted at once. A refusal returns "denied" so the screen can explain it.
 */
export async function saveToPhotos(card: CapturedCard): Promise<SaveResult> {
  let permission = await getPermissionsAsync(true, []);
  if (!permission.granted) permission = await requestPermissionsAsync(true, []);
  if (!permission.granted) return "denied";
  await Asset.create(card.uri);
  return "saved";
}

/** The system share sheet for the image file. */
export async function shareCard(card: CapturedCard): Promise<void> {
  await shareAsync(card.uri, {
    mimeType: card.mimeType,
    UTI: card.mimeType === "image/png" ? "public.png" : "public.jpeg",
  });
}
