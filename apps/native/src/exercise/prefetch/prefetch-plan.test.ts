import { describe, expect, it } from "vitest";

import { batches, isUnmetered, prefetchMissing } from "./prefetch-plan";

const urls = (count: number) => Array.from({ length: count }, (_, index) => `https://m/${index}`);

function ports(options: { cached?: Set<string>; failOn?: number; abortAfter?: number } = {}) {
  const controller = new AbortController();
  const calls: string[][] = [];
  return {
    calls,
    controller,
    ports: {
      signal: controller.signal,
      isCached: async (url: string) => options.cached?.has(url) ?? false,
      prefetch: async (batch: string[]) => {
        calls.push(batch);
        if (options.abortAfter === calls.length) controller.abort();
        return options.failOn !== calls.length;
      },
    },
  };
}

describe("thumbnail prefetch", () => {
  it("splits into batches of 20", () => {
    expect(batches(urls(45), 20).map((group) => group.length)).toEqual([20, 20, 5]);
    expect(batches([], 20)).toEqual([]);
  });

  it("fetches every thumbnail, once each, in batches of 20", async () => {
    const run = ports();
    const result = await prefetchMissing([...urls(45), ...urls(5)], run.ports);
    expect(run.calls.map((batch) => batch.length)).toEqual([20, 20, 5]);
    expect(run.calls.flat()).toEqual(urls(45));
    expect(result).toEqual({
      total: 45,
      alreadyCached: 0,
      prefetched: 45,
      failed: 0,
      cancelled: false,
    });
  });

  it("skips what the cache already holds", async () => {
    const cached = new Set(urls(30));
    const run = ports({ cached });
    const result = await prefetchMissing(urls(45), run.ports);
    expect(run.calls.flat()).toEqual(urls(45).slice(30));
    expect(result.alreadyCached).toBe(30);
    expect(result.prefetched).toBe(15);
  });

  it("does nothing when everything is cached", async () => {
    const run = ports({ cached: new Set(urls(10)) });
    const result = await prefetchMissing(urls(10), run.ports);
    expect(run.calls).toEqual([]);
    expect(result).toMatchObject({ alreadyCached: 10, prefetched: 0, cancelled: false });
  });

  it("stops at the first failed batch and counts what was left", async () => {
    const run = ports({ failOn: 2 });
    const result = await prefetchMissing(urls(65), run.ports);
    expect(run.calls).toHaveLength(2);
    expect(result).toMatchObject({ prefetched: 20, failed: 45, cancelled: false });
  });

  it("starts no batch once cancelled, and drops the result of the one in flight", async () => {
    const run = ports({ abortAfter: 1 });
    const result = await prefetchMissing(urls(65), run.ports);
    expect(run.calls).toHaveLength(1);
    expect(result).toMatchObject({ prefetched: 0, cancelled: true });
  });

  it("does not start when already cancelled", async () => {
    const run = ports();
    run.controller.abort();
    const result = await prefetchMissing(urls(5), run.ports);
    expect(run.calls).toEqual([]);
    expect(result.cancelled).toBe(true);
  });

  it("treats only Wi-Fi and Ethernet as unmetered", () => {
    expect(isUnmetered({ type: "WIFI", isConnected: true })).toBe(true);
    expect(isUnmetered({ type: "ETHERNET", isConnected: true })).toBe(true);
    expect(isUnmetered({ type: "CELLULAR", isConnected: true })).toBe(false);
    expect(isUnmetered({ type: "WIFI", isConnected: false })).toBe(false);
    expect(isUnmetered({})).toBe(false);
  });
});
