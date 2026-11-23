import { describe, expect, it } from "vitest";

import { createTabActionStore } from "./tab-action-store";

describe("tab action store", () => {
  it("keeps its setters identical across every change", () => {
    const store = createTabActionStore();
    const before = store.getState();
    before.setReserved(40);
    const release = before.holdBarHidden();
    const after = store.getState();
    expect(after.setAction).toBe(before.setAction);
    expect(after.setReserved).toBe(before.setReserved);
    expect(after.holdBarHidden).toBe(before.holdBarHidden);
    release();
  });

  it("hides the bar while any hold is open", () => {
    const store = createTabActionStore();
    const first = store.getState().holdBarHidden();
    const second = store.getState().holdBarHidden();
    expect(store.getState().barHidden).toBe(true);
    first();
    expect(store.getState().barHidden).toBe(true);
    second();
    expect(store.getState().barHidden).toBe(false);
  });

  it("reserves and releases height", () => {
    const store = createTabActionStore();
    store.getState().setReserved(56);
    expect(store.getState().reserved).toBe(56);
    store.getState().setReserved(0);
    expect(store.getState().reserved).toBe(0);
  });

  it("gives each provider its own state", () => {
    const one = createTabActionStore();
    const two = createTabActionStore();
    one.getState().setReserved(10);
    expect(two.getState().reserved).toBe(0);
  });
});
