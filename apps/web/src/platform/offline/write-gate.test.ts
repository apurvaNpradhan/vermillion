import { describe, expect, it } from "vitest";

import { trackWrite, whenWritesIdle } from "./write-gate";

describe("write gate", () => {
  it("is idle with no writes", async () => {
    await expect(whenWritesIdle()).resolves.toBeUndefined();
  });

  it("holds the update until the last in-flight write settles, even when it fails", async () => {
    let finishFirst!: () => void;
    const first = trackWrite(new Promise<void>((resolve) => (finishFirst = resolve)));
    const second = trackWrite(Promise.reject(new Error("write failed")));
    await expect(second).rejects.toThrow("write failed");

    let idle = false;
    void whenWritesIdle().then(() => (idle = true));
    await Promise.resolve();
    expect(idle).toBe(false);

    finishFirst();
    await first;
    await whenWritesIdle();
    expect(idle).toBe(true);
  });
});
