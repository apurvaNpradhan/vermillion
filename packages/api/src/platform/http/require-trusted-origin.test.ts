import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { requireTrustedOrigin } from "./require-trusted-origin";

const app = new Hono()
  .use(requireTrustedOrigin(["https://app.example.com"]))
  .all("/", (c) => c.text("ok"));

describe("trusted origin", () => {
  it("allows requests without an Origin (native and server clients)", async () => {
    expect((await app.request("/", { method: "POST" })).status).toBe(200);
  });
  it("allows the app origin", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { origin: "https://app.example.com" },
    });
    expect(response.status).toBe(200);
  });
  it.each([
    "https://evil.example",
    "https://app.example.com.evil.example",
    "null",
    "http://app.example.com",
  ])("rejects state-changing requests from %s", async (origin) => {
    const response = await app.request("/", { method: "POST", headers: { origin } });
    expect(response.status).toBe(403);
  });
  it("does not guard safe methods", async () => {
    const response = await app.request("/", { headers: { origin: "https://evil.example" } });
    expect(response.status).toBe(200);
  });
});
