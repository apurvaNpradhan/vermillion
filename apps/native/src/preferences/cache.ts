import { z } from "zod";
import { preferencesSchema, type Preferences } from "@workspace/shared";
import { deviceStorage } from "@/platform/storage";

const KEY = "account.preferences";
let activeUserId: string | null = null;
/** A single account envelope: switching accounts never reads the previous account's preferences. */
export function readPreferencesCache(userId: string): Preferences | undefined {
  activeUserId = userId;
  const raw = deviceStorage.get(KEY);
  if (!raw) return;
  try {
    const result = z
      .object({ userId: z.string(), preferences: preferencesSchema })
      .safeParse(JSON.parse(raw));
    if (result.success && result.data.userId === userId) return result.data.preferences;
    deviceStorage.set(KEY, null);
  } catch {
    /* Invalid device data is ignored. */
  }
}
export function writePreferencesCache(userId: string, preferences: Preferences) {
  if (activeUserId !== userId) return;
  deviceStorage.set(KEY, JSON.stringify({ userId, preferences }));
}
export function clearPreferencesCache() {
  activeUserId = null;
  deviceStorage.set(KEY, null);
}
