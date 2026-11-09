import { describe, expect, it } from "vitest";

import {
  AssertedCredentialSchema,
  AuthenticationOptionsSchema,
  CreatedCredentialSchema,
  PasskeyListSchema,
  RegistrationOptionsSchema,
  classifyPasskeyError,
  outcomeFor,
  shouldOfferPasskey,
  toAuthenticationResponse,
  toPasskeyRows,
  toRegistrationResponse,
} from "./passkey-logic";

describe("passkey options", () => {
  it("accepts the server's registration options", () => {
    const parsed = RegistrationOptionsSchema.safeParse({
      challenge: "abc",
      rp: { id: "example.com", name: "App" },
      user: { id: "u1", name: "a@b.c", displayName: "a@b.c" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ id: "cred", type: "public-key", transports: ["internal"] }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects options without a challenge or rp id", () => {
    expect(RegistrationOptionsSchema.safeParse({ rp: { name: "App" } }).success).toBe(false);
    expect(AuthenticationOptionsSchema.safeParse({ challenge: "abc" }).success).toBe(false);
    expect(AuthenticationOptionsSchema.safeParse({ challenge: "abc", rpId: "x.com" }).success).toBe(
      true,
    );
  });
});

describe("credential responses", () => {
  it("shapes a created credential for verify-registration", () => {
    const raw = CreatedCredentialSchema.parse({
      id: "i",
      rawId: "r",
      authenticatorAttachment: "platform",
      response: { clientDataJSON: "c", attestationObject: "a", transports: ["internal"] },
    });
    expect(toRegistrationResponse(raw)).toEqual({
      id: "i",
      rawId: "r",
      type: "public-key",
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
      response: { clientDataJSON: "c", attestationObject: "a", transports: ["internal"] },
    });
  });

  it("drops an attachment the server would not understand", () => {
    const raw = CreatedCredentialSchema.parse({
      id: "i",
      rawId: "r",
      authenticatorAttachment: "weird",
      response: { clientDataJSON: "c", attestationObject: "a" },
    });
    expect(toRegistrationResponse(raw)).not.toHaveProperty("authenticatorAttachment");
  });

  it("falls back to id when the library omits rawId", () => {
    const raw = AssertedCredentialSchema.parse({
      id: "i",
      response: { authenticatorData: "d", clientDataJSON: "c", signature: "s" },
    });
    expect(toAuthenticationResponse(raw).rawId).toBe("i");
  });

  it("rejects an assertion without a signature", () => {
    const parsed = AssertedCredentialSchema.safeParse({
      id: "i",
      response: { authenticatorData: "d", clientDataJSON: "c" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("passkey list", () => {
  it("sorts newest first and blanks empty names and bad dates", () => {
    const rows = toPasskeyRows(
      PasskeyListSchema.parse([
        { id: "old", name: "Pixel", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", name: "  ", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "none", name: null, createdAt: "garbage" },
      ]),
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "old", "none"]);
    expect(rows[0]?.name).toBeNull();
    expect(rows[2]?.createdAt).toBeNull();
  });
});

describe("error mapping", () => {
  it("is silent for a dismissed sheet", () => {
    expect(classifyPasskeyError("UserCancelled")).toBe("cancelled");
    expect(outcomeFor("cancelled")).toEqual({ status: "cancelled" });
  });

  it("explains a device without a provider", () => {
    expect(classifyPasskeyError("NoCreateOption")).toBe("unsupported");
    expect(classifyPasskeyError("NotSupported")).toBe("unsupported");
    expect(outcomeFor("unsupported")).toEqual({
      status: "error",
      messageKey: "passkeys__error_unsupported",
    });
  });

  it("tells apart the other known codes and falls back to a generic failure", () => {
    expect(classifyPasskeyError("NoCredentials")).toBe("none-found");
    expect(classifyPasskeyError("CredentialAlreadyExists")).toBe("exists");
    expect(classifyPasskeyError("BadConfiguration")).toBe("misconfigured");
    expect(classifyPasskeyError("TimedOut")).toBe("failed");
    expect(classifyPasskeyError(null)).toBe("failed");
  });
});

describe("setup step routing", () => {
  it("offers the step only when supported and not answered", () => {
    expect(shouldOfferPasskey(true, null)).toBe(true);
    expect(shouldOfferPasskey(false, null)).toBe(false);
    expect(shouldOfferPasskey(true, "done")).toBe(false);
    expect(shouldOfferPasskey(true, "skipped")).toBe(false);
  });
});
