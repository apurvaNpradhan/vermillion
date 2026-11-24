import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settleWithin } from "./settle";

const never = new Promise<void>(() => {});

describe("settleWithin", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the value when the work finishes first", async () => {
    await expect(settleWithin(Promise.resolve(7), never, 1000)).resolves.toEqual({
      status: "done",
      value: 7,
    });
  });

  it("gives up when abandoned first", async () => {
    await expect(
      settleWithin(new Promise<number>(() => {}), Promise.resolve(), 1000),
    ).resolves.toEqual({
      status: "abandoned",
    });
  });

  it("times out when nothing settles", async () => {
    const result = settleWithin(new Promise<number>(() => {}), never, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ status: "timeout" });
  });

  it("rejects when the work rejects", async () => {
    await expect(settleWithin(Promise.reject(new Error("boom")), never, 1000)).rejects.toThrow(
      "boom",
    );
  });
});
