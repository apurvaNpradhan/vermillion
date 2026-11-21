import { ORPCError } from "@orpc/server";
import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";

import { scrubServerEvent, shouldReport } from "./error-reporting";

describe("shouldReport", () => {
  it("reports unexpected errors", () => {
    expect(shouldReport(new Error("boom"))).toBe(true);
  });

  it("skips typed 4xx failures", () => {
    expect(shouldReport(new ORPCError("NOT_FOUND"))).toBe(false);
    expect(shouldReport(new ORPCError("CONFLICT"))).toBe(false);
    expect(shouldReport(new ORPCError("TOO_MANY_REQUESTS"))).toBe(false);
  });

  it("reports typed 5xx failures", () => {
    expect(shouldReport(new ORPCError("BAD_GATEWAY"))).toBe(true);
    expect(shouldReport(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(true);
  });
});

describe("scrubServerEvent", () => {
  const event: ErrorEvent = {
    type: undefined,
    user: { id: "user-1", email: "ada@example.com", ip_address: "203.0.113.9" },
    request: {
      url: "https://api.example.com/rpc/x?token=abc",
      method: "POST",
      data: "secret body",
      cookies: { session: "s" },
      headers: { authorization: "Bearer x", cookie: "a=b" },
      query_string: "token=abc",
    },
    message: "duplicate key for ada@example.com",
    exception: { values: [{ type: "error", value: "Key (email)=(ada@example.com) exists" }] },
    breadcrumbs: [{ message: "log ada@example.com" }],
  };

  it("keeps only the internal user id", () => {
    expect(scrubServerEvent(event).user).toEqual({ id: "user-1" });
  });

  it("drops the body, cookies, headers and query string", () => {
    expect(scrubServerEvent(event).request).toEqual({
      url: "https://api.example.com/rpc/x",
      method: "POST",
    });
  });

  it("redacts emails in messages and exceptions, and drops breadcrumbs", () => {
    const scrubbed = scrubServerEvent(event);
    expect(scrubbed.message).toBe("duplicate key for [email]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("Key (email)=([email]) exists");
    expect(scrubbed.breadcrumbs).toEqual([]);
  });
});
