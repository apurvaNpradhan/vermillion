import { describe, expect, it } from "vitest";

import { destinationFor, forwardHeaders, forwardRequest } from "./forward";

describe("destinationFor", () => {
  it("forwards the API paths only", () => {
    expect(destinationFor("/rpc/release/status")).toBe("api");
    expect(destinationFor("/api/auth/get-session")).toBe("api");
    expect(destinationFor("/rpc")).toBe("api");
    expect(destinationFor("/rpcx")).toBe("assets");
    expect(destinationFor("/apis")).toBe("assets");
  });

  it("resolves the download link and the admin shell", () => {
    expect(destinationFor("/download")).toBe("download");
    expect(destinationFor("/admin")).toBe("shell");
    expect(destinationFor("/admin/catalog")).toBe("shell");
    expect(destinationFor("/invite")).toBe("shell");
    expect(destinationFor("/administrator")).toBe("assets");
    expect(destinationFor("/privacy")).toBe("assets");
  });
});

describe("forwardHeaders", () => {
  it("keeps cookies and origin, and replaces the address chain with Cloudflare's", () => {
    const headers = forwardHeaders(
      new Headers({
        cookie: "session=1",
        origin: "https://cinnabar.example.com",
        "content-type": "application/json",
        "x-turnstile-token": "t",
        host: "cinnabar.example.com",
        "x-forwarded-for": "6.6.6.6",
        "x-client-ip": "6.6.6.6",
        "cf-connecting-ip": "203.0.113.7",
        "cf-ray": "abc",
      }),
      "cinnabar.example.com",
    );
    expect(headers.get("cookie")).toBe("session=1");
    expect(headers.get("origin")).toBe("https://cinnabar.example.com");
    expect(headers.get("x-turnstile-token")).toBe("t");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("x-client-ip")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("cf-ray")).toBeNull();
  });

  it("sends no address at all when Cloudflare gave none", () => {
    const headers = forwardHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" }), "s.example.com");
    expect(headers.get("x-forwarded-for")).toBeNull();
  });
});

describe("forwardRequest", () => {
  it("keeps the method, path, query and body, on the API's origin", async () => {
    const forwarded = forwardRequest(
      new Request("https://cinnabar.example.com/rpc/access/request?x=1", {
        method: "POST",
        body: '{"json":{}}',
        headers: { "content-type": "application/json" },
      }),
      "https://cinnabar-api.example.com",
    );
    expect(forwarded.url).toBe("https://cinnabar-api.example.com/rpc/access/request?x=1");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.redirect).toBe("manual");
    expect(await forwarded.text()).toBe('{"json":{}}');
  });
});
