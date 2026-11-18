import type { SessionData } from "@workspace/client/session";
import { z } from "zod";

/**
 * The only parts of a session this app reads offline: who the user is and when the session ends.
 * No session token and no other user field is ever written to secure storage.
 */
const snapshotSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
  expiresAt: z.string(),
});

/** The text kept in secure storage for a session the server confirmed. */
export function encodeSessionSnapshot(session: NonNullable<SessionData>): string {
  const snapshot: z.infer<typeof snapshotSchema> = {
    user: { id: session.user.id, email: session.user.email, name: session.user.name ?? null },
    expiresAt: new Date(session.session.expiresAt).toISOString(),
  };
  return JSON.stringify(snapshot);
}

/** A stored snapshot as a session; null when it is missing, corrupt or from an older format. */
export function decodeSessionSnapshot(raw: string | null): SessionData {
  if (!raw) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    // SAFETY: the app reads only `user.id`, `user.name`, `user.email` and `session.expiresAt`
    // from a session, and those are exactly the fields validated above.
    return {
      user: parsed.data.user,
      session: { expiresAt: new Date(parsed.data.expiresAt) },
    } as SessionData;
  } catch {
    return null;
  }
}
