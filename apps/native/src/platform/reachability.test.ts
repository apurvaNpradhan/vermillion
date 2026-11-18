import { describe, expect, it } from "vitest";

import { probeReachable } from "./reachability";

describe("probeReachable", () => {
  it("is true on a 200 and false on any other status", async () => {
    expect(await probeReachable("https://x/health", async () => ({ status: 200 }))).toBe(true);
    expect(await probeReachable("https://x/health", async () => ({ status: 503 }))).toBe(false);
  });

  it("is false when the request fails, and gives up after the timeout", async () => {
    expect(
      await probeReachable("https://x/health", async () => {
        throw new Error("Network request failed");
      }),
    ).toBe(false);
    const hung = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<{ status: number }>((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    expect(await probeReachable("https://x/health", hung, 20)).toBe(false);
  });
});
