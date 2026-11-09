import { describe, expect, it } from "vitest";

import { routeGuards, toSessionState, type SessionInputs } from "./session-state";

function inputs(
  session: Partial<SessionInputs["session"]> = {},
  owner: Partial<SessionInputs["owner"]> = {},
  signedOut = false,
): SessionInputs {
  return {
    session: { isPending: false, hasSession: false, needsOnboarding: false, ...session },
    owner: { isPending: false, hasOwner: false, ...owner },
    signedOut,
  };
}

describe("toSessionState", () => {
  it("waits for the device owner before anything else", () => {
    expect(toSessionState(inputs({ hasSession: true }, { isPending: true }))).toEqual({
      status: "loading",
    });
  });

  it("waits for the session only when the device has no owner", () => {
    expect(toSessionState(inputs({ isPending: true }))).toEqual({ status: "loading" });
    expect(toSessionState(inputs({ isPending: true }, { hasOwner: true }))).toEqual({
      status: "owner-only",
    });
  });

  it("is signed in whenever there is a session", () => {
    expect(toSessionState(inputs({ hasSession: true }, { hasOwner: true }))).toEqual({
      status: "signed-in",
    });
  });

  it("sends a session with a pending required step to onboarding", () => {
    expect(toSessionState(inputs({ hasSession: true, needsOnboarding: true }))).toEqual({
      status: "onboarding",
    });
    // Even with a kept Device owner: the account must be complete first.
    expect(
      toSessionState(inputs({ hasSession: true, needsOnboarding: true }, { hasOwner: true })),
    ).toEqual({ status: "onboarding" });
  });

  it("never forces onboarding on a device owner without a session", () => {
    expect(toSessionState(inputs({ needsOnboarding: true }, { hasOwner: true }))).toEqual({
      status: "owner-only",
    });
    expect(toSessionState(inputs({ needsOnboarding: true }))).toEqual({ status: "signed-out" });
  });

  it("opens on the welcome screen after an explicit sign-out, data kept", () => {
    expect(toSessionState(inputs({}, { hasOwner: true }, true))).toEqual({ status: "signed-out" });
    // A stale flag never hides a live session.
    expect(toSessionState(inputs({ hasSession: true }, { hasOwner: true }, true))).toEqual({
      status: "signed-in",
    });
  });

  it("is signed out with neither a session nor an owner", () => {
    expect(toSessionState(inputs())).toEqual({ status: "signed-out" });
  });
});

describe("routeGuards", () => {
  it("opens no group while loading", () => {
    expect(routeGuards({ status: "loading" })).toBeNull();
  });

  it("keeps the app and auth groups apart for a known session", () => {
    expect(routeGuards({ status: "signed-out" })).toEqual({
      app: false,
      auth: true,
      onboarding: false,
    });
    expect(routeGuards({ status: "signed-in" })).toEqual({
      app: true,
      auth: false,
      onboarding: false,
    });
  });

  it("opens only onboarding while a required step is pending", () => {
    expect(routeGuards({ status: "onboarding" })).toEqual({
      app: false,
      auth: false,
      onboarding: true,
    });
  });

  it("lets an owner without a session reach both, for the sign-in banner", () => {
    expect(routeGuards({ status: "owner-only" })).toEqual({
      app: true,
      auth: true,
      onboarding: false,
    });
  });
});
