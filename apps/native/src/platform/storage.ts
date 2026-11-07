import * as SecureStore from "expo-secure-store";

/**
 * Small per-device key-value store (theme, language). Reads are synchronous so
 * the first frame already uses the saved choice. Keys: letters, digits, `.-_`.
 */
export const deviceStorage = {
  get(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) SecureStore.deleteItemAsync(key).catch(() => undefined);
      else SecureStore.setItem(key, value);
    } catch {
      // A device that cannot persist keeps the in-memory choice for this session.
    }
  },
};
