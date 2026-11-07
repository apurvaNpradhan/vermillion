import { describe, expect, it, vi } from "vitest";

import { createEmailTransport, LOG_EMAIL_MARKER } from "./transport";

const email = { to: "a@example.com", subject: "Hi", html: "<p>x</p>", text: "plain body" };

describe("email transport", () => {
  it("logs to the console without a provider key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await createEmailTransport({ isProduction: false }).send(email);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining(`${LOG_EMAIL_MARKER} to=a@example.com`),
    );
    info.mockRestore();
  });
  it("refuses to run in production without a key unless logging is explicit", () => {
    expect(() => createEmailTransport({ isProduction: true })).toThrow(/RESEND_API_KEY/);
    expect(() => createEmailTransport({ isProduction: true, consoleOnly: true })).not.toThrow();
  });
  it("requires a sender address with a key", () => {
    expect(() => createEmailTransport({ isProduction: true, resendApiKey: "re_x" })).toThrow(
      /EMAIL_FROM/,
    );
  });
});
