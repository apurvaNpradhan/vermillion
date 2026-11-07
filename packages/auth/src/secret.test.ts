import { describe, expect, it } from "vitest";

import { assertStrongSecret } from "./secret";

describe("auth secret", () => {
  it("accepts a generated secret", () => {
    const secret = "VpI24zyI74x9VsKSjxxWFVvBpqt9W43b";
    expect(assertStrongSecret(secret)).toBe(secret);
  });
  it.each([undefined, "", "short", "a".repeat(40), "abababababababababababababababab"])(
    "refuses a missing or weak secret (%s)",
    (secret) => {
      expect(() => assertStrongSecret(secret)).toThrow(/BETTER_AUTH_SECRET/);
    },
  );
});
