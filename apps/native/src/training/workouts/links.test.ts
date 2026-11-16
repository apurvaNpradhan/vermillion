import { describe, expect, it } from "vitest";

import { splitLinks } from "./links";

describe("splitLinks", () => {
  it("finds links and keeps trailing punctuation out of them", () => {
    expect(splitLinks("Form: https://example.com/a, then rest. See www.site.org!")).toEqual([
      { text: "Form: ", url: null },
      { text: "https://example.com/a", url: "https://example.com/a" },
      { text: ", then rest. See ", url: null },
      { text: "www.site.org", url: "https://www.site.org" },
      { text: "!", url: null },
    ]);
  });

  it("leaves a note without links whole, and an empty one empty", () => {
    expect(splitLinks("Seat 4")).toEqual([{ text: "Seat 4", url: null }]);
    expect(splitLinks("")).toEqual([]);
  });
});
