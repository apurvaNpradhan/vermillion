import { describe, expect, it } from "vitest";

import { welcomeTokens } from "./welcome-tokens";

describe("welcomeTokens", () => {
  it("splits words and icon slots in order", () => {
    expect(welcomeTokens("Works offline <offline/> and syncs <sync/>.")).toEqual([
      { kind: "word", text: "Works" },
      { kind: "word", text: "offline" },
      { kind: "icon", name: "offline" },
      { kind: "word", text: "and" },
      { kind: "word", text: "syncs" },
      { kind: "icon", name: "sync" },
      { kind: "word", text: "." },
    ]);
  });

  it("handles adjacent slots and extra spaces", () => {
    expect(welcomeTokens("  Train <barbell/><fork/>  now ")).toEqual([
      { kind: "word", text: "Train" },
      { kind: "icon", name: "barbell" },
      { kind: "icon", name: "fork" },
      { kind: "word", text: "now" },
    ]);
  });

  it("keeps text that only looks like a tag as words", () => {
    expect(welcomeTokens("a <b> c")).toEqual([
      { kind: "word", text: "a" },
      { kind: "word", text: "<b>" },
      { kind: "word", text: "c" },
    ]);
  });
});
