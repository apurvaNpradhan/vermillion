import { describe, expect, it } from "vitest";

import { createDelayedFlag, isDisconnected } from "./connectivity";

/** A manual clock standing in for setTimeout. */
function clock() {
  let now = 0;
  let next = 1;
  const tasks = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = next++;
        tasks.set(id, { at: now + ms, run });
        return id;
      },
      clear: (id: number) => void tasks.delete(id),
    },
    advance(ms: number) {
      now += ms;
      for (const [id, task] of tasks) {
        if (task.at <= now) {
          tasks.delete(id);
          task.run();
        }
      }
    },
  };
}

function setup(delay = 2000) {
  const time = clock();
  const changes: boolean[] = [];
  const flag = createDelayedFlag(delay, (value) => changes.push(value), time.timers);
  return { time, changes, flag };
}

describe("createDelayedFlag", () => {
  it("rises only after the grace period", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    time.advance(1999);
    expect(changes).toEqual([]);
    time.advance(1);
    expect(changes).toEqual([true]);
  });

  it("never shows for a brief drop", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    time.advance(1500);
    flag.set(false);
    time.advance(5000);
    expect(changes).toEqual([]);
  });

  it("falls at once on reconnect", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    time.advance(2000);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  it("does not restart the grace period while still disconnected", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    time.advance(1000);
    flag.set(true);
    time.advance(1000);
    expect(changes).toEqual([true]);
  });

  it("starts a fresh grace period after a reconnect", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    time.advance(2000);
    flag.set(false);
    flag.set(true);
    time.advance(1999);
    expect(changes).toEqual([true, false]);
    time.advance(1);
    expect(changes).toEqual([true, false, true]);
  });

  it("stops a pending rise when disposed", () => {
    const { time, changes, flag } = setup();
    flag.set(true);
    flag.dispose();
    time.advance(5000);
    expect(changes).toEqual([]);
  });
});

describe("isDisconnected", () => {
  it("is true only for an active account that is not connected", () => {
    expect(isDisconnected({ phase: { kind: "active", owner: "u" }, indicator: "paused" })).toBe(
      true,
    );
    expect(isDisconnected({ phase: { kind: "active", owner: "u" }, indicator: "connected" })).toBe(
      false,
    );
    expect(isDisconnected({ phase: { kind: "active", owner: "u" }, indicator: "uploading" })).toBe(
      false,
    );
  });

  it("ignores states that are not about the connection", () => {
    expect(isDisconnected({ phase: { kind: "starting" }, indicator: "paused" })).toBe(false);
    expect(isDisconnected({ phase: { kind: "unclaimed" }, indicator: "paused" })).toBe(false);
    expect(isDisconnected(null)).toBe(false);
  });
});
