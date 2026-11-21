import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent } from "./scrub";

describe("scrubBreadcrumb", () => {
  it("strips query strings from request and navigation URLs", () => {
    const breadcrumb: Breadcrumb = {
      category: "http",
      data: { url: "https://api.example.com/rpc/x?token=secret", method: "POST", status_code: 200 },
    };
    expect(scrubBreadcrumb(breadcrumb).data).toEqual({
      url: "https://api.example.com/rpc/x",
      method: "POST",
      status_code: 200,
    });
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/a?x=1", to: "/b?code=123456" } })
        .data,
    ).toEqual({ from: "/a", to: "/b" });
  });

  it("redacts emails in console messages and data", () => {
    expect(
      scrubBreadcrumb({ category: "console", message: "sign in ada@example.com failed" }),
    ).toMatchObject({ message: "sign in [email] failed" });
    expect(scrubBreadcrumb({ category: "x", data: { note: "ada@example.com" } }).data).toEqual({
      note: "[email]",
    });
  });

  it("strips the query of a URL inside a message", () => {
    expect(
      scrubBreadcrumb({ message: "GET https://api.example.com/verify?code=1234 failed" }).message,
    ).toBe("GET https://api.example.com/verify failed");
  });
});

describe("scrubEvent", () => {
  const event: ErrorEvent = {
    type: undefined,
    user: { id: "account-1", email: "ada@example.com", ip_address: "203.0.113.9" },
    message: "failed for ada@example.com",
    request: {
      url: "https://api.example.com/x?token=abc",
      cookies: { session: "s" },
      headers: { authorization: "Bearer x" },
      data: "body",
    },
    exception: { values: [{ type: "Error", value: "no user ada@example.com" }] },
    breadcrumbs: [{ category: "console", message: "hi ada@example.com" }],
    contexts: { device: { name: "Ada's Pixel", model: "Pixel 9" } },
  };

  it("identifies the user only by the anonymous id", () => {
    expect(scrubEvent(event, "anon-1").user).toEqual({ id: "anon-1" });
  });

  it("reduces the request to a scrubbed URL", () => {
    expect(scrubEvent(event, "a").request).toEqual({ url: "https://api.example.com/x" });
  });

  it("redacts emails in the message, exceptions and breadcrumbs", () => {
    const scrubbed = scrubEvent(event, "a");
    expect(scrubbed.message).toBe("failed for [email]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("no user [email]");
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe("hi [email]");
  });

  it("drops the device's user-given name and keeps its model", () => {
    const device = scrubEvent(event, "a").contexts?.device;
    expect(device?.name).toBeUndefined();
    expect(device?.model).toBe("Pixel 9");
  });

  it("does not mutate the original event", () => {
    scrubEvent(event, "a");
    expect(event.user?.email).toBe("ada@example.com");
  });
});
