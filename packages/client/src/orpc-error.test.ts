import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { errorMessageKey, isUnauthorized } from "./orpc-error";

describe("errorMessageKey", () => {
  it("maps every typed code", () => {
    expect(errorMessageKey(new ORPCError("FORBIDDEN"))).toBe("errors__forbidden");
    expect(errorMessageKey(new ORPCError("TOO_MANY_REQUESTS"))).toBe("errors__too_many_requests");
    expect(errorMessageKey(new ORPCError("NOT_FOUND"))).toBe("errors__not_found");
  });

  it("prefers the detail code over the typed code", () => {
    const error = new ORPCError("FORBIDDEN", { data: { code: "ADMIN_ROLE_MANAGED" } });
    expect(errorMessageKey(error)).toBe("errors__admin_role_managed");
  });

  it("falls back to the typed code for an unknown detail code", () => {
    const error = new ORPCError("BAD_REQUEST", { data: { code: "SOMETHING_NEW" } });
    expect(errorMessageKey(error)).toBe("errors__bad_request");
  });

  it("never exposes server wording and handles non-API errors", () => {
    expect(errorMessageKey(new ORPCError("BAD_REQUEST", { message: "secret detail" }))).toBe(
      "errors__bad_request",
    );
    expect(errorMessageKey(new Error("boom"))).toBe("errors__unknown");
    expect(errorMessageKey(undefined)).toBe("errors__unknown");
  });
});

describe("isUnauthorized", () => {
  it("is true only for UNAUTHORIZED, not for a refusal", () => {
    expect(isUnauthorized(new ORPCError("UNAUTHORIZED"))).toBe(true);
    expect(isUnauthorized(new ORPCError("FORBIDDEN"))).toBe(false);
    expect(isUnauthorized(new Error("x"))).toBe(false);
  });
});
