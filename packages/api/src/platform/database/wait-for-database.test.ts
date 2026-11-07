import { describe, expect, it, vi } from "vitest";

import { waitForDatabase } from "./wait-for-database";

describe("waitForDatabase", () => {
  it("retries until the query succeeds", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async () => undefined);
    await waitForDatabase({ query, sleep, retryDelayMs: 5 });
    expect(query).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("throws the last error once attempts run out", async () => {
    const query = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(
      waitForDatabase({ query, sleep: async () => undefined, maxAttempts: 3 }),
    ).rejects.toThrow("still down");
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("rejects nonsensical settings", async () => {
    await expect(waitForDatabase({ query: async () => 1, maxAttempts: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(waitForDatabase({ query: async () => 1, retryDelayMs: -1 })).rejects.toThrow(
      RangeError,
    );
  });
});
