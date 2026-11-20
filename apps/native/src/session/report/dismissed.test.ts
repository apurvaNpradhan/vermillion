import { describe, expect, it } from "vitest";

import { readDismissed, withDismissed } from "./dismissed";

describe("dismissed reports", () => {
  it("reads what was stored and ignores what is not a list of keys", () => {
    expect(readDismissed('["2026-10","2025"]')).toEqual(["2026-10", "2025"]);
    expect(readDismissed(null)).toEqual([]);
    expect(readDismissed("nope")).toEqual([]);
    expect(readDismissed('{"a":1}')).toEqual([]);
    expect(readDismissed("[1,2]")).toEqual([]);
  });

  it("adds a key once and keeps the newest few", () => {
    expect(withDismissed(["a"], "a")).toEqual(["a"]);
    expect(withDismissed(["a"], "b")).toEqual(["a", "b"]);
    const many = Array.from({ length: 30 }, (_, index) => `k${index}`);
    expect(withDismissed(many, "new")).toHaveLength(24);
    expect(withDismissed(many, "new").at(-1)).toBe("new");
  });
});
