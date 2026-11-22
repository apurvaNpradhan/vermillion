import { describe, expect, it, vi } from "vitest";

import { submitEmail } from "./send-code";

const deps = (
  overrides: {
    confirmOnline?: () => Promise<boolean>;
    sendCode?: () => Promise<string | null>;
  } = {},
) => ({
  confirmOnline: vi.fn(overrides.confirmOnline ?? (async () => true)),
  sendCode: vi.fn(overrides.sendCode ?? (async () => null)),
});

describe("submitting the email", () => {
  it("rejects an invalid address without touching the network", async () => {
    const d = deps();
    expect(await submitEmail("not-an-email", d)).toEqual({ status: "invalid" });
    expect(d.confirmOnline).not.toHaveBeenCalled();
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it("asks for the code exactly once and returns the trimmed address", async () => {
    const d = deps();
    expect(await submitEmail("  me@example.com ", d)).toEqual({
      status: "sent",
      email: "me@example.com",
    });
    expect(d.sendCode).toHaveBeenCalledTimes(1);
    expect(d.sendCode).toHaveBeenCalledWith("me@example.com");
  });

  it("sends nothing while offline", async () => {
    const d = deps({ confirmOnline: async () => false });
    expect(await submitEmail("me@example.com", d)).toEqual({ status: "offline" });
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it("reports the server's refusal as a translation key and does not move on", async () => {
    const d = deps({ sendCode: async () => "auth__closed" });
    expect(await submitEmail("me@example.com", d)).toEqual({
      status: "failed",
      errorKey: "auth__closed",
    });
  });
});
