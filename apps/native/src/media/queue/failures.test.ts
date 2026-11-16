import { describe, expect, it } from "vitest";

import { createFailureTracker, FAILURES_BEFORE_FAILED } from "./failures";

describe("failure tracker", () => {
  it("counts a file as failed only after several failures in a row", () => {
    const tracker = createFailureTracker();
    for (let attempt = 1; attempt < FAILURES_BEFORE_FAILED; attempt += 1) {
      tracker.record("a");
      expect(tracker.has("a")).toBe(false);
    }
    tracker.record("a");
    expect(tracker.has("a")).toBe(true);
    expect(tracker.has("b")).toBe(false);
  });

  it("tells listeners only when a file enters or leaves failed", () => {
    const tracker = createFailureTracker();
    let calls = 0;
    const stop = tracker.subscribe(() => {
      calls += 1;
    });
    const before = tracker.version();
    for (let attempt = 0; attempt < FAILURES_BEFORE_FAILED + 2; attempt += 1) tracker.record("a");
    expect(calls).toBe(1);
    expect(tracker.version()).toBe(before + 1);
    tracker.clear("b");
    expect(calls).toBe(1);
    tracker.clear("a");
    expect(tracker.has("a")).toBe(false);
    expect(calls).toBe(2);
    stop();
    for (let attempt = 0; attempt < FAILURES_BEFORE_FAILED; attempt += 1) tracker.record("c");
    expect(calls).toBe(2);
  });

  it("fails again at once when the user retries and it fails once more", () => {
    const tracker = createFailureTracker();
    for (let attempt = 0; attempt < FAILURES_BEFORE_FAILED; attempt += 1) tracker.record("a");
    tracker.retrying("a");
    expect(tracker.has("a")).toBe(false);
    tracker.record("a");
    expect(tracker.has("a")).toBe(true);
  });
});
