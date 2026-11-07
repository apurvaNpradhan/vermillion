import { describe, expect, it, vi } from "vitest";

import { verifyTurnstile, type TurnstileOptions } from "./turnstile";

const options = (overrides: Partial<TurnstileOptions> = {}): TurnstileOptions => ({
  secret: "secret",
  hostname: "app.example.com",
  isProduction: true,
  fetch: vi.fn<typeof fetch>(),
  ...overrides,
});

type SiteverifyReply = { success: boolean | string; hostname: string; action?: string };
const respond = (payload: SiteverifyReply) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
const failure = { ok: false, reason: "Captcha verification failed." };

describe("Turnstile verification", () => {
  // JSON.parse yields an untyped value: what a client could actually send.
  it.each([null, undefined, JSON.parse("{}"), JSON.parse("42"), "", "x".repeat(2049)])(
    "rejects missing or malformed tokens before any network access (%s)",
    async (token) => {
      const fetch = vi.fn();
      expect((await verifyTurnstile(token, options({ fetch }))).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { success: true, hostname: "other.example.com", action: "auth" },
    { success: true, hostname: "app.example.com", action: "other" },
    { success: true, hostname: "app.example.com" },
    { success: "true", hostname: "app.example.com", action: "auth" },
    { success: false, hostname: "app.example.com", action: "auth" },
  ])("rejects a wrong action, hostname or success value: %j", async (payload) => {
    expect((await verifyTurnstile("token", options({ fetch: respond(payload) }))).ok).toBe(false);
  });

  it("accepts strict success for the auth action on the deployment hostname", async () => {
    const fetch = respond({ success: true, hostname: "app.example.com", action: "auth" });
    expect(await verifyTurnstile("token", options({ fetch }))).toEqual({ ok: true });
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = init?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("Expected a form body");
    expect(body.get("response")).toBe("token");
    expect(body.get("secret")).toBe("secret");
  });

  it("fails closed on malformed JSON, HTTP failure and transport errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json"))
      .mockResolvedValueOnce(new Response("upstream secret", { status: 500 }))
      .mockRejectedValueOnce(new Error("upstream secret"));
    for (let i = 0; i < 3; i++)
      expect(await verifyTurnstile("token", options({ fetch }))).toEqual(failure);
  });

  it("refuses localhost in production, even with a perfect answer", async () => {
    const fetch = respond({ success: true, hostname: "localhost", action: "auth" });
    const result = await verifyTurnstile("token", options({ fetch, hostname: "localhost" }));
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    const dev = await verifyTurnstile(
      "token",
      options({ fetch, hostname: "localhost", isProduction: false }),
    );
    expect(dev.ok).toBe(true);
  });

  it("is skipped when no secret is configured", async () => {
    const fetch = vi.fn();
    expect(await verifyTurnstile(null, options({ secret: undefined, fetch }))).toEqual({
      ok: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
