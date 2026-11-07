import { describe, expect, it } from "vitest";

import { transition, type LifecycleEvent, type Phase } from "./lifecycle-state";
import { deriveIndicator, trackPendingSince } from "./sync-status";

const active: Phase = { kind: "active", owner: "a" };
const reauth: Phase = { kind: "reauth-required", owner: "a" };
const blocked: Phase = { kind: "blocked", owner: "a", signedInAs: "b", source: "session" };

function run(start: Phase, ...events: LifecycleEvent[]) {
  let phase = start;
  const effects: string[] = [];
  for (const event of events) {
    const next = transition(phase, event);
    phase = next.phase;
    effects.push(...next.effects.map((effect) => effect.type));
  }
  return { phase, effects };
}

describe("device owner lifecycle", () => {
  it("claims the database for the first user to sign in and connects", () => {
    const { phase, effects } = run(
      { kind: "starting" },
      { type: "owner-loaded", owner: null },
      { type: "session", userId: "a" },
    );
    expect(phase).toEqual(active);
    expect(effects).toEqual(["claim", "connect"]);
  });

  it("an owned database starts connecting without waiting for a session", () => {
    expect(run({ kind: "starting" }, { type: "owner-loaded", owner: "a" })).toEqual({
      phase: active,
      effects: ["connect"],
    });
  });

  it("session expiry keeps the data and pauses; the same user resumes", () => {
    const expired = run(active, { type: "unauthorized" });
    expect(expired).toEqual({ phase: reauth, effects: ["disconnect"] });
    expect(run(reauth, { type: "session", userId: "a" })).toEqual({
      phase: active,
      effects: ["connect"],
    });
    expect(run(active, { type: "session", userId: null }).phase).toEqual(reauth);
  });

  it("a different user is blocked and never connected", () => {
    const afterExpiry = run(reauth, { type: "session", userId: "b" });
    expect(afterExpiry.phase).toEqual(blocked);
    expect(afterExpiry.effects).toEqual([]);
    expect(run(active, { type: "session", userId: "b" })).toEqual({
      phase: blocked,
      effects: ["disconnect"],
    });
  });

  it("switching back to the owner lifts the block; signing out leaves it locked for the owner", () => {
    expect(run(blocked, { type: "session", userId: "a" })).toEqual({
      phase: active,
      effects: ["connect"],
    });
    expect(run(blocked, { type: "session", userId: null }).phase).toEqual(reauth);
  });

  it("discarding wipes, then hands the database to the new user", () => {
    const { phase, effects } = run(blocked, { type: "discard-confirmed" }, { type: "wiped" });
    expect(phase).toEqual({ kind: "active", owner: "b" });
    expect(effects).toEqual(["disconnect", "wipe", "claim", "connect"]);
  });

  it("never wipes without being blocked and confirmed", () => {
    for (const phase of [active, reauth, { kind: "unclaimed" } as const]) {
      expect(run(phase, { type: "discard-confirmed" })).toEqual({ phase, effects: [] });
    }
  });

  it("wipes only for the owner's confirmed account deletion", () => {
    expect(run(reauth, { type: "account-deleted", userId: "other" }).effects).toEqual([]);
    const deleted = run(reauth, { type: "account-deleted", userId: "a" }, { type: "wiped" });
    expect(deleted.effects).toEqual(["disconnect", "wipe"]);
    expect(deleted.phase).toEqual({ kind: "unclaimed" });
  });

  it("a server-reported wrong account blocks, and a cached owner session does not lift it", () => {
    const serverBlocked = run(active, { type: "wrong-account" });
    expect(serverBlocked.effects).toEqual(["disconnect"]);
    expect(serverBlocked.phase).toMatchObject({ kind: "blocked", source: "server" });
    expect(run(serverBlocked.phase, { type: "session", userId: "a" }).effects).toEqual([]);
    // Signing out and in again does.
    expect(
      run(serverBlocked.phase, { type: "session", userId: null }, { type: "session", userId: "a" })
        .phase,
    ).toEqual(active);
  });

  it("an incompatible client pauses and stays paused through session changes", () => {
    const paused = run(active, { type: "update-required" });
    expect(paused).toEqual({
      phase: { kind: "update-required", owner: "a" },
      effects: ["disconnect"],
    });
    expect(run(paused.phase, { type: "session", userId: "a" }).effects).toEqual([]);
    expect(run(paused.phase, { type: "unauthorized" }).phase).toEqual(paused.phase);
  });

  it("ignores session news while switching", () => {
    const switching: Phase = { kind: "switching", to: "b" };
    expect(run(switching, { type: "session", userId: "a" })).toEqual({
      phase: switching,
      effects: [],
    });
  });

  it("follows another tab's owner change", () => {
    expect(run(active, { type: "owner-changed", owner: "b" }).phase).toEqual({
      kind: "active",
      owner: "b",
    });
    expect(run(active, { type: "owner-changed", owner: null }).phase).toEqual({
      kind: "unclaimed",
    });
  });
});

describe("sync indicator", () => {
  const idle = { connected: true, uploading: false, pendingCount: 0 };
  it("maps phases and facts", () => {
    expect(deriveIndicator(active, idle)).toBe("connected");
    expect(deriveIndicator(active, { ...idle, pendingCount: 2 })).toBe("uploading");
    expect(deriveIndicator(active, { ...idle, connected: false })).toBe("paused");
    expect(deriveIndicator(reauth, idle)).toBe("locked");
    expect(deriveIndicator(blocked, idle)).toBe("locked");
    expect(deriveIndicator({ kind: "update-required", owner: "a" }, idle)).toBe("update-required");
    expect(deriveIndicator({ kind: "unclaimed" }, idle)).toBe("paused");
  });

  it("remembers when the queue first filled", () => {
    expect(trackPendingSince(null, 0, 10)).toBeNull();
    expect(trackPendingSince(null, 2, 10)).toBe(10);
    expect(trackPendingSince(10, 3, 99)).toBe(10);
    expect(trackPendingSince(10, 0, 99)).toBeNull();
  });
});
