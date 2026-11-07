import { describe, expect, it } from "vitest";

import { authErrorKey } from "./auth-error";

describe("authErrorKey", () => {
  it("maps known Better Auth codes", () => {
    expect(authErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "auth__error_invalid_credentials",
    );
    expect(authErrorKey({ code: "CAPTCHA_FAILED" })).toBe("errors__captcha_failed");
    expect(authErrorKey({ code: "ACCESS_DENIED" })).toBe("auth__error_oauth_denied");
    expect(authErrorKey({ code: "ACCOUNT_NOT_LINKED" })).toBe("auth__error_account_linking");
    expect(authErrorKey({ code: "UNABLE_TO_LINK_ACCOUNT" })).toBe("auth__error_account_linking");
  });
  it("maps rate limiting by status and falls back for the rest", () => {
    expect(authErrorKey({ status: 429 })).toBe("errors__too_many_requests");
    expect(authErrorKey({ code: "WHATEVER", status: 500 })).toBe("auth__error_unknown");
    expect(authErrorKey(null)).toBe("auth__error_unknown");
  });
});
