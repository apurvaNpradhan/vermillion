/**
 * Where the signed-in state stands, from the session query and the device owner (ADR 0021).
 * - `loading`: neither is known yet; the splash screen stays up.
 * - `signed-out`: no session and no local owner: only the welcome and auth screens.
 * - `onboarding`: a session whose profile still lacks a required step (ADR 0029): only the
 *   onboarding screen, so the app and the Device owner's first claim wait for a complete account.
 * - `signed-in`: a session with nothing pending: only the app.
 * - `owner-only`: the device holds a user's data but has no session (offline, or the session
 *   expired). The app opens on the local data, and auth stays reachable for the sign-in banner.
 *   After an explicit sign-out the same device is `signed-out` instead: the data stays, but the
 *   app opens on the welcome screen until someone signs in.
 */
export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "onboarding" }
  | { status: "signed-in" }
  | { status: "owner-only" };

export type SessionInputs = {
  session: {
    isPending: boolean;
    hasSession: boolean;
    /** The session's profile has a pending required onboarding step. */
    needsOnboarding: boolean;
  };
  owner: { isPending: boolean; hasOwner: boolean };
  /** The user signed out on purpose (not an expired session). */
  signedOut: boolean;
};

export function toSessionState({ session, owner, signedOut }: SessionInputs): SessionState {
  if (owner.isPending) return { status: "loading" };
  if (session.hasSession) return { status: session.needsOnboarding ? "onboarding" : "signed-in" };
  // A device with an owner opens without waiting for the network, unless the user signed out.
  if (owner.hasOwner && !signedOut) return { status: "owner-only" };
  if (session.isPending) return { status: "loading" };
  return { status: "signed-out" };
}

/** Which root groups `Stack.Protected` lets through; `null` while loading. */
export function routeGuards(
  state: SessionState,
): { app: boolean; auth: boolean; onboarding: boolean } | null {
  switch (state.status) {
    case "loading":
      return null;
    case "signed-out":
      return { app: false, auth: true, onboarding: false };
    case "onboarding":
      return { app: false, auth: false, onboarding: true };
    case "signed-in":
      return { app: true, auth: false, onboarding: false };
    case "owner-only":
      return { app: true, auth: true, onboarding: false };
  }
}
