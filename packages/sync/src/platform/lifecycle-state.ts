/**
 * The Device owner lifecycle as a pure state machine (ADR 0021). It decides; the controller
 * (`controller.ts`) does the I/O the effects ask for, one transition at a time.
 *
 * Local reads and writes are allowed in every phase. Phases only decide whether the device
 * uploads and downloads, and whether another user may take the database over.
 */
export type Phase =
  /** The Device owner has not been read from the database yet. */
  | { kind: "starting" }
  /** Nobody has signed in on this database yet. */
  | { kind: "unclaimed" }
  /** The owner's data is on the device and sync may run. */
  | { kind: "active"; owner: string }
  /** The session ended (401, signed out): local work continues, uploads wait for the owner. */
  | { kind: "reauth-required"; owner: string }
  /**
   * Someone other than the owner is signed in (`signedInAs` is null when only the server said so).
   * Their session must not touch this database. Offer switch back, or discard after confirming.
   * `source: "server"` means a response, not the session cache, said it: a cached session of the
   * owner then does not lift the block.
   */
  | { kind: "blocked"; owner: string; signedInAs: string | null; source: "session" | "server" }
  /** The local data is being removed (discard or confirmed account deletion). */
  | { kind: "switching"; to: string | null }
  /** The server no longer accepts this build; writes are kept, uploads paused. */
  | { kind: "update-required"; owner: string };

export type LifecycleEvent =
  | { type: "owner-loaded"; owner: string | null }
  /** The session as the app last learned it; `userId` is null when signed out. */
  | { type: "session"; userId: string | null }
  | { type: "unauthorized" }
  | { type: "wrong-account" }
  | { type: "update-required" }
  | { type: "discard-confirmed" }
  /** The server confirmed this account's deletion. */
  | { type: "account-deleted"; userId: string }
  /** The wipe finished. */
  | { type: "wiped" }
  /** Another tab changed or removed the Device owner. */
  | { type: "owner-changed"; owner: string | null };

export type LifecycleEffect =
  | { type: "claim"; userId: string }
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "wipe" };

export type Transition = { phase: Phase; effects: LifecycleEffect[] };

const stay = (phase: Phase): Transition => ({ phase, effects: [] });

const DISCONNECT: LifecycleEffect = { type: "disconnect" };
const CONNECT: LifecycleEffect = { type: "connect" };

/** The owner of a phase that has one. */
export function phaseOwner(phase: Phase): string | null {
  switch (phase.kind) {
    case "active":
    case "reauth-required":
    case "blocked":
    case "update-required":
      return phase.owner;
    default:
      return null;
  }
}

function onSession(phase: Phase, userId: string | null): Transition {
  switch (phase.kind) {
    case "unclaimed":
      return userId
        ? {
            phase: { kind: "active", owner: userId },
            effects: [{ type: "claim", userId }, CONNECT],
          }
        : stay(phase);
    case "active":
      if (userId === phase.owner) return stay(phase);
      return userId === null
        ? { phase: { kind: "reauth-required", owner: phase.owner }, effects: [DISCONNECT] }
        : {
            phase: { kind: "blocked", owner: phase.owner, signedInAs: userId, source: "session" },
            effects: [DISCONNECT],
          };
    case "reauth-required":
      if (userId === null) return stay(phase);
      return userId === phase.owner
        ? { phase: { kind: "active", owner: phase.owner }, effects: [CONNECT] }
        : stay({ kind: "blocked", owner: phase.owner, signedInAs: userId, source: "session" });
    case "blocked":
      if (userId === null) return stay({ kind: "reauth-required", owner: phase.owner });
      if (userId === phase.owner) {
        // A server verdict outlives a cached session; only a fresh sign-in (null first) lifts it.
        return phase.source === "server"
          ? stay(phase)
          : { phase: { kind: "active", owner: phase.owner }, effects: [CONNECT] };
      }
      return stay({ kind: "blocked", owner: phase.owner, signedInAs: userId, source: "session" });
    default:
      return stay(phase);
  }
}

/** The next phase and the effects to run, for an event in a phase. */
export function transition(phase: Phase, event: LifecycleEvent): Transition {
  switch (event.type) {
    case "owner-loaded":
      if (phase.kind !== "starting") return stay(phase);
      return event.owner
        ? { phase: { kind: "active", owner: event.owner }, effects: [CONNECT] }
        : stay({ kind: "unclaimed" });

    case "session":
      return onSession(phase, event.userId);

    case "unauthorized":
      return phase.kind === "active"
        ? { phase: { kind: "reauth-required", owner: phase.owner }, effects: [DISCONNECT] }
        : stay(phase);

    case "wrong-account":
      return phase.kind === "active" || phase.kind === "reauth-required"
        ? {
            phase: { kind: "blocked", owner: phase.owner, signedInAs: null, source: "server" },
            effects: [DISCONNECT],
          }
        : stay(phase);

    case "update-required": {
      const owner = phaseOwner(phase);
      return owner && phase.kind !== "blocked"
        ? { phase: { kind: "update-required", owner }, effects: [DISCONNECT] }
        : stay(phase);
    }

    case "discard-confirmed":
      return phase.kind === "blocked"
        ? {
            phase: { kind: "switching", to: phase.signedInAs },
            effects: [DISCONNECT, { type: "wipe" }],
          }
        : stay(phase);

    case "account-deleted":
      // Only the owner's confirmed deletion removes the local copy.
      return phaseOwner(phase) === event.userId
        ? { phase: { kind: "switching", to: null }, effects: [DISCONNECT, { type: "wipe" }] }
        : stay(phase);

    case "wiped":
      if (phase.kind !== "switching") return stay(phase);
      return phase.to
        ? {
            phase: { kind: "active", owner: phase.to },
            effects: [{ type: "claim", userId: phase.to }, CONNECT],
          }
        : stay({ kind: "unclaimed" });

    case "owner-changed": {
      if (phase.kind === "switching" || phase.kind === "starting") return stay(phase);
      if (event.owner === phaseOwner(phase)) return stay(phase);
      return event.owner
        ? stay({ kind: "active", owner: event.owner })
        : { phase: { kind: "unclaimed" }, effects: [DISCONNECT] };
    }
  }
}
