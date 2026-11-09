import { describe, expect, it } from "vitest";

import { SORT_KEY, parseSort } from "./sort-preference";

describe("sort preference", () => {
  it("uses A-Z when nothing is stored", () => {
    expect(parseSort(null)).toBe("az");
  });

  it("restores a known sort", () => {
    expect(parseSort("popular")).toBe("popular");
    expect(parseSort("az")).toBe("az");
  });

  it("ignores a value it does not know", () => {
    expect(parseSort("newest")).toBe("az");
    expect(parseSort("")).toBe("az");
  });

  it("uses a key SecureStore accepts", () => {
    expect(SORT_KEY).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
