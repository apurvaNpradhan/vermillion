import type { SessionStore } from "@workspace/client/session";

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
