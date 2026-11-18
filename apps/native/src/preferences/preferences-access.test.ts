import { describe, expect, it } from "vitest";

import { preferencesAccess } from "./preferences-access";

describe("preferencesAccess", () => {
  it("lets the session user of the Device owner in", () => {
    expect(preferencesAccess({ sessionUser: "a", owner: "a", installId: "i1" })).toEqual({
      owner: "a",
      installId: "i1",
      key: "a|i1",
    });
  });

  it("keeps the owner's access while there is no session (offline, expired)", () => {
    expect(preferencesAccess({ sessionUser: null, owner: "a", installId: "i1" })?.owner).toBe("a");
  });

  it("blocks another account's session on this device", () => {
    expect(preferencesAccess({ sessionUser: "b", owner: "a", installId: "i1" })).toBeNull();
  });

  it("denies access while sync is blocked, whatever the cached session says", () => {
    const blocked = { owner: "a", installId: "i1", blocked: true };
    expect(preferencesAccess({ ...blocked, sessionUser: "a" })).toBeNull();
    expect(preferencesAccess({ ...blocked, sessionUser: null })).toBeNull();
  });

  it("waits for an owner and an install id", () => {
    expect(preferencesAccess({ sessionUser: "a", owner: null, installId: "i1" })).toBeNull();
    expect(preferencesAccess({ sessionUser: "a", owner: "a", installId: null })).toBeNull();
  });

  it("keys the watch by owner and install id", () => {
    const first = preferencesAccess({ sessionUser: "a", owner: "a", installId: "i1" });
    const second = preferencesAccess({ sessionUser: "a", owner: "a", installId: "i2" });
    expect(first?.key).not.toBe(second?.key);
  });
});
