import type { SessionData, SessionStore } from "@workspace/client/session";
import { z } from "zod";

import { deviceStorage } from "@/platform/storage";

const KEY = "auth.session";

/** The parts of the session this app reads; anything else Better Auth sent is kept as is. */
const storedSessionSchema = z.object({
  user: z.looseObject({ id: z.string(), email: z.string() }),
  session: z.looseObject({ id: z.string(), expiresAt: z.string() }),
});

/**
 * The last session the server confirmed, kept in secure storage so the app still knows who is
 * signed in without a connection. Sign-out and a "nobody" answer forget it.
 */
export const storedSession: SessionStore = {
  read() {
    const raw = deviceStorage.get(KEY);
    if (!raw) return null;
    try {
      const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
      // SAFETY: the value is JSON this app saved from a Better Auth session; the fields the app
      // reads are validated above, and dates come back as ISO strings.
      return parsed.success ? (parsed.data as SessionData) : null;
    } catch {
      return null;
    }
  },
  write(session) {
    deviceStorage.set(KEY, session ? JSON.stringify(session) : null);
  },
};
