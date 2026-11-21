import { describe, expect, it } from "vitest";

import { ANONYMOUS_ID_KEY, crashReportsEnabled, readAnonymousId, type KeyValueStore } from "./gate";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
  };
}

describe("crashReportsEnabled", () => {
  it("is on until the person turns it off", () => {
    expect(crashReportsEnabled(null)).toBe(true);
    expect(crashReportsEnabled("true")).toBe(true);
    expect(crashReportsEnabled("false")).toBe(false);
  });

  it("treats an unreadable value as on, not as an opt-out", () => {
    expect(crashReportsEnabled("")).toBe(true);
  });
});

describe("readAnonymousId", () => {
  it("makes an id once and keeps it", () => {
    const store = memoryStore();
    let made = 0;
    const makeId = () => `id-${++made}`;
    expect(readAnonymousId(store, makeId)).toBe("id-1");
    expect(readAnonymousId(store, makeId)).toBe("id-1");
    expect(store.values.get(ANONYMOUS_ID_KEY)).toBe("id-1");
    expect(made).toBe(1);
  });

  it("reuses a stored id", () => {
    const store = memoryStore({ [ANONYMOUS_ID_KEY]: "existing" });
    expect(readAnonymousId(store, () => "new")).toBe("existing");
  });
});
