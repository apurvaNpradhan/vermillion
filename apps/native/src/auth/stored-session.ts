import type { SessionStore } from "@workspace/client/session";

import * as SecureStore from "expo-secure-store";

import { appConfig } from "@/platform/app-config";
import { deviceStorage } from "@/platform/storage";

import { decodeSessionSnapshot, encodeSessionSnapshot } from "./session-snapshot";
import { isSignedOut, setSignedOut } from "./signed-out";

const KEY = "auth.session";

/**
 * The identity and expiry of the last session the server confirmed, kept in secure storage so the
 * app still knows who is signed in without a connection (until it expires). Sign-out and a
 * "nobody" answer forget it. After an explicit sign-out nothing is read back, and only a session
 * the server confirmed (a write) lifts that sign-out.
 */
export const storedSession: SessionStore = {
  read() {
    if (isSignedOut()) return null;
    return decodeSessionSnapshot(deviceStorage.get(KEY));
  },
  write(session) {
    if (!session) {
      deviceStorage.set(KEY, null);
      return;
    }
    // A write is always a server-confirmed answer (stored sessions are never written back).
    setSignedOut(false);
    deviceStorage.set(KEY, encodeSessionSnapshot(session));
  },
};

const PURGE_KEY = "auth.legacy-caches-purged";
/** The plugin stores long values in numbered chunks, in one or two slots. */
const CHUNK_SLOTS = 16;

/**
 * Upgrade cleanup, once: earlier builds kept the full session (token included) in the Expo
 * plugin's `<scheme>_session_data` cache and in our own `auth.session` entry. Both are deleted;
 * `auth.session` is kept only when it already is the identity-and-expiry snapshot.
 */
export function purgeLegacySessionCaches() {
  if (deviceStorage.get(PURGE_KEY) === "1") return;
  if (deviceStorage.get(KEY) !== null && decodeSessionSnapshot(deviceStorage.get(KEY)) === null)
    deviceStorage.set(KEY, null);
  const base = `${appConfig.scheme}_session_data`;
  const keys = [base];
  for (let i = 0; i < CHUNK_SLOTS; i++) {
    keys.push(`${base}.${i}`, `${base}.0.${i}`, `${base}.1.${i}`);
  }
  void Promise.all(keys.map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined))).then(
    () => deviceStorage.set(PURGE_KEY, "1"),
  );
}
