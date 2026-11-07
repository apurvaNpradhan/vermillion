import { describe, expect, it } from "vitest";

import { createLocalDataResetStore } from "./local-data-reset";

describe("local data reset store", () => {
  it("holds an event reported before any listener exists", () => {
    const store = createLocalDataResetStore();
    store.report({ reason: "missing-key", movedTo: "a" });
    expect(store.get()).toEqual({ reason: "missing-key", movedTo: "a" });
  });

  it("notifies subscribers and clears on dismiss", () => {
    const store = createLocalDataResetStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.report({ reason: "wrong-key", movedTo: "b" });
    store.dismiss();
    expect(store.get()).toBeNull();
    expect(calls).toBe(2);
    unsubscribe();
    store.report({ reason: "wrong-key", movedTo: "c" });
    expect(calls).toBe(2);
  });
});
