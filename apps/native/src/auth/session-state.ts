/**
 * Where the signed-in state stands, from the session query and the device owner (ADR 0021).
 * - `loading`: neither is known yet; the splash screen stays up.
 * - `signed-out`: no session and no local owner: only the welcome and auth screens.
 * - `signed-in`: a session: only the app.
 * - `owner-only`: the device holds a user's data but has no session (offline, or the session
 *   expired). The app opens on the local data, and auth stays reachable for the sign-in banner.
 */
export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in" }
  | { status: "owner-only" };

export type SessionInputs = {
  session: { isPending: boolean; hasSession: boolean };
  owner: { isPending: boolean; hasOwner: boolean };
};

export function toSessionState({ session, owner }: SessionInputs): SessionState {
  if (owner.isPending) return { status: "loading" };
  if (session.hasSession) return { status: "signed-in" };
  // A device with an owner opens without waiting for the network.
  if (owner.hasOwner) return { status: "owner-only" };
  if (session.isPending) return { status: "loading" };
  return { status: "signed-out" };
}

/** Which root groups `Stack.Protected` lets through; `null` while loading. */
export function routeGuards(state: SessionState): { app: boolean; auth: boolean } | null {
  switch (state.status) {
    case "loading":
      return null;
    case "signed-out":
      return { app: false, auth: true };
    case "signed-in":
      return { app: true, auth: false };
    case "owner-only":
      return { app: true, auth: true };
  }
}
