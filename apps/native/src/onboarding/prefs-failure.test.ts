import { describe, expect, it } from "vitest";

import { prefsFailureOf } from "./prefs-failure";

describe("prefsFailureOf", () => {
  it("names unavailable storage separately from other failures", () => {
    expect(
      prefsFailureOf(
        Object.assign(new Error("Storage unavailable"), { name: "StorageUnavailableError" }),
      ),
    ).toBe("onboarding__prefs_unavailable");
    expect(prefsFailureOf(new Error("offline"))).toBe("onboarding__prefs_failed");
  });
});
