import { describe, expect, it } from "vitest";

import { adminGate } from "./admin-gate";

const known = (twoFactorEnabled: boolean, sessionVerified: boolean) => ({
  state: "known" as const,
  twoFactorEnabled,
  sessionVerified,
});

describe("adminGate", () => {
  it("waits for the session, then asks to sign in", () => {
    expect(
      adminGate({ sessionLoading: true, signedIn: false, enrolment: { state: "loading" } }),
    ).toBe("loading");
    expect(
      adminGate({ sessionLoading: false, signedIn: false, enrolment: { state: "loading" } }),
    ).toBe("sign-in");
  });

  it("shows not-found to a signed-in person who is not an admin", () => {
    expect(
      adminGate({ sessionLoading: false, signedIn: true, enrolment: { state: "denied" } }),
    ).toBe("not-found");
    expect(
      adminGate({ sessionLoading: false, signedIn: true, enrolment: { state: "error" } }),
    ).toBe("not-found");
  });

  it("enrols, then verifies, then opens the admin", () => {
    const at = (enrolment: ReturnType<typeof known>) =>
      adminGate({ sessionLoading: false, signedIn: true, enrolment });
    expect(at(known(false, false))).toBe("enrol");
    expect(at(known(true, false))).toBe("verify");
    expect(at(known(true, true))).toBe("ready");
  });
});
