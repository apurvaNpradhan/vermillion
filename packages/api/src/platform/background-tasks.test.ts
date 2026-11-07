import { afterEach, describe, expect, it, vi } from "vitest";

import { createBackgroundTasks } from "./background-tasks";

afterEach(() => vi.useRealTimers());

describe("background tasks", () => {
  it("drains pending work", async () => {
    const tasks = createBackgroundTasks();
    let release!: () => void;
    tasks.run(new Promise<void>((resolve) => (release = resolve)));
    let drained = false;
    const draining = tasks.drain().then((result) => (drained = result));
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await draining;
    expect(drained).toBe(true);
  });

  it("swallows failures without surfacing their message", async () => {
    const tasks = createBackgroundTasks();
    tasks.run(Promise.reject(new Error("token=123456 to recipient@example.com")));
    expect(await tasks.drain()).toBe(true);
  });

  it("bounds shutdown waiting without discarding the pending work", async () => {
    vi.useFakeTimers();
    const tasks = createBackgroundTasks();
    let release!: () => void;
    tasks.run(new Promise<void>((resolve) => (release = resolve)));
    const draining = tasks.drain(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await draining).toBe(false);
    release();
    expect(await tasks.drain()).toBe(true);
  });
});
