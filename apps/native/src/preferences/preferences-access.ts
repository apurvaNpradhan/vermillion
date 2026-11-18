/** Who a screen is reading or writing preferences for, and which cached watch belongs to them. */
export type PreferencesAccess = { owner: string; installId: string; key: string };

/**
 * Whether this screen may touch the device's preferences (ADR 0021). The database holds the
 * Device owner's row only, so a session of anyone else (account B on A's device, before the
 * wipe) gets nothing: not A's units to read, and no write to be uploaded under A's install id.
 * A device without a session keeps its owner's access (the app opens on local data offline).
 * A `blocked` sync phase (the server or the session saw a different account) denies access even
 * while the cached session still names the owner or is gone: the device is locked until the user
 * switches back or discards it.
 * The key names the watch cache entry: another owner or install id never reuses a snapshot.
 */
export function preferencesAccess(input: {
  sessionUser: string | null;
  owner: string | null;
  installId: string | null;
  blocked?: boolean;
}): PreferencesAccess | null {
  const { sessionUser, owner, installId, blocked } = input;
  if (!owner || !installId || blocked) return null;
  if (sessionUser !== null && sessionUser !== owner) return null;
  return { owner, installId, key: `${owner}|${installId}` };
}
