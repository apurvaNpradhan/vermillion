import { describe, expect, it } from "vitest";

import { createSharedWatch } from "./shared-watch";

type Feed = { emit: (value: number) => void; fail: () => void; stopped: boolean };

function setup() {
  const feeds: Feed[] = [];
  const watch = createSharedWatch<object, number>({
    start: (_database, _key, onValue, onError) => {
      const feed: Feed = { emit: onValue, fail: onError, stopped: false };
      feeds.push(feed);
      return () => {
        feed.stopped = true;
      };
    },
  });
  return { watch, feeds, database: {} };
}

describe("createSharedWatch", () => {
  it("runs one watch for every listener of a key and stops with the last", () => {
    const { watch, feeds, database } = setup();
    const seen: number[] = [];
    const off1 = watch.subscribe(database, "a", () => seen.push(1));
    const off2 = watch.subscribe(database, "a", () => seen.push(2));
    expect(feeds).toHaveLength(1);
    feeds[0]?.emit(7);
    expect(seen).toEqual([1, 2]);
    expect(watch.snapshot(database, "a").value).toBe(7);
    off1();
    expect(feeds[0]?.stopped).toBe(false);
    off2();
    expect(feeds[0]?.stopped).toBe(true);
  });

  it("keeps keys apart and does not republish an equal value", () => {
    const { watch, feeds, database } = setup();
    let calls = 0;
    watch.subscribe(database, "a", () => (calls += 1));
    watch.subscribe(database, "b", () => undefined);
    expect(feeds).toHaveLength(2);
    feeds[0]?.emit(1);
    feeds[0]?.emit(1);
    expect(calls).toBe(1);
    expect(watch.snapshot(database, "b").value).toBeUndefined();
  });

  it("reports a failure and restarts on retry", () => {
    const { watch, feeds, database } = setup();
    watch.subscribe(database, "a", () => undefined);
    feeds[0]?.fail();
    expect(watch.snapshot(database, "a").failed).toBe(true);
    watch.retry(database, "a");
    expect(feeds[0]?.stopped).toBe(true);
    expect(feeds).toHaveLength(2);
    expect(watch.snapshot(database, "a")).toEqual({ value: undefined, failed: false });
  });
});
