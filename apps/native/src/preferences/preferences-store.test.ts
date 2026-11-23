import { DEFAULT_UI_PREFERENCES, type Preferences } from "@workspace/shared";
import { shallow } from "zustand/shallow";
import { createStore, type StoreApi } from "zustand/vanilla";
import { describe, expect, it } from "vitest";

import { memoSelector } from "./preferences-store";

const prefs = (ui: Partial<Preferences["ui"]> = {}): Preferences => ({
  locale: null,
  timezone: null,
  ui: { ...DEFAULT_UI_PREFERENCES, ...ui },
});

/** Feeds a selector from a store the way a hook does and counts the results that differ. */
function reader<T>(
  store: StoreApi<Preferences>,
  select: (p: Preferences) => T,
  isEqual?: (a: T, b: T) => boolean,
) {
  const read = memoSelector(select, isEqual);
  const results = [read(store.getState())];
  store.subscribe((state) => {
    const next = read(state);
    if (!Object.is(next, results[results.length - 1])) results.push(next);
  });
  return results;
}

describe("memoSelector", () => {
  it("does not change when an unrelated preference changes", () => {
    const store = createStore<Preferences>(() => prefs());
    const results = reader(store, (p) => p.ui.systemKeyboard);
    store.setState(prefs({ weightUnit: "lb" }), true);
    store.setState(prefs({ weightUnit: "kg" }), true);
    expect(results).toEqual([DEFAULT_UI_PREFERENCES.systemKeyboard]);
  });

  it("changes when the selected preference changes", () => {
    const store = createStore<Preferences>(() => prefs({ systemKeyboard: false }));
    const results = reader(store, (p) => p.ui.systemKeyboard);
    store.setState(prefs({ systemKeyboard: true }), true);
    expect(results).toEqual([false, true]);
  });

  it("keeps an object result while the equality says it is the same", () => {
    const store = createStore<Preferences>(() => prefs());
    const pick = (p: Preferences) => ({ unit: p.ui.weightUnit, keyboard: p.ui.systemKeyboard });
    const loose = reader(store, pick);
    const tight = reader(store, pick, shallow);
    store.setState(prefs({ systemKeyboard: DEFAULT_UI_PREFERENCES.systemKeyboard }), true);
    expect(loose.length).toBe(2);
    expect(tight.length).toBe(1);
    store.setState(prefs({ weightUnit: "lb" }), true);
    expect(tight.length).toBe(2);
    expect(tight[1]?.unit).toBe("lb");
  });

  it("keeps the result across new wrappers that share a cache", () => {
    const state = prefs();
    const cache = { current: null };
    const select = (p: Preferences) => ({ unit: p.ui.weightUnit });
    const first = memoSelector(select, shallow, cache)(state);
    const second = memoSelector(select, shallow, cache)(prefs());
    expect(second).toBe(first);
  });
});
