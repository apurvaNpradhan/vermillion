import { describe, expect, it } from "vitest";

import { deepEqual, keepIfEqual } from "./equal";

describe("deepEqual", () => {
  it("compares nested plain data by value, whatever the key order", () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
  });

  it("tells a changed field, a missing key and a different length apart", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("does not confuse null, undefined, arrays and objects", () => {
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe("keepIfEqual", () => {
  it("keeps the earlier object while the data is the same", () => {
    const before = { weight: 60, reps: null };
    expect(keepIfEqual(before, { weight: 60, reps: null })).toBe(before);
  });

  it("takes the new object when the data moved or nothing was held", () => {
    const next = { weight: 62.5, reps: null };
    expect(keepIfEqual({ weight: 60, reps: null }, next)).toBe(next);
    expect(keepIfEqual(undefined, next)).toBe(next);
  });
});
