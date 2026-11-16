import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createImageGate } from "./image-gate";

describe("image gate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is idle at once with nothing loading", async () => {
    await expect(createImageGate().whenIdle(1000)).resolves.toBeUndefined();
  });

  it("waits until every picture has settled", async () => {
    const gate = createImageGate();
    const first = gate.begin();
    const second = gate.begin();
    let idle = false;
    void gate.whenIdle(5000).then(() => (idle = true));
    first();
    await vi.advanceTimersByTimeAsync(10);
    expect(idle).toBe(false);
    second();
    await vi.advanceTimersByTimeAsync(10);
    expect(idle).toBe(true);
  });

  it("gives up after the time limit", async () => {
    const gate = createImageGate();
    gate.begin();
    let idle = false;
    void gate.whenIdle(1500).then(() => (idle = true));
    await vi.advanceTimersByTimeAsync(1499);
    expect(idle).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(idle).toBe(true);
  });

  it("counts a picture once however often it settles", async () => {
    const gate = createImageGate();
    const first = gate.begin();
    gate.begin();
    first();
    first();
    let idle = false;
    void gate.whenIdle(1000).then(() => (idle = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(idle).toBe(false);
  });
});
