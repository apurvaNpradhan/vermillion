/** Who a screen is reading or writing preferences for, and which cached watch belongs to them. */
export type PreferencesAccess = { owner: string; installId: string; key: string };

/**
 * Whether this screen may touch the device's preferences (ADR 0021). The database holds the
 * Device owner's row only, so a session of anyone else (account B on A's device, before the
 * wipe) gets nothing: not A's units to read, and no write to be uploaded under A's install id.
 * A device without a session keeps its owner's access (the app opens on local data offline).
 * The key names the watch cache entry: another owner or install id never reuses a snapshot.
 */
export function preferencesAccess(input: {
  sessionUser: string | null;
  owner: string | null;
  installId: string | null;
}): PreferencesAccess | null {
  const { sessionUser, owner, installId } = input;
  if (!owner || !installId) return null;
  if (sessionUser !== null && sessionUser !== owner) return null;
  return { owner, installId, key: `${owner}|${installId}` };
}
