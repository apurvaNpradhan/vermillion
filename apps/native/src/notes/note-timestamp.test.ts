import { describe, expect, it } from "vitest";

import { noteTimestamp } from "./note-timestamp";

describe("noteTimestamp", () => {
  const now = new Date(2026, 10, 8, 18, 0);

  it("shows only the time for today", () => {
    expect(noteTimestamp(new Date(2026, 10, 8, 9, 5).toISOString(), now, "en")).toMatch(/9:05/);
  });

  it("shows day and month earlier this year, with the year before that", () => {
    expect(noteTimestamp(new Date(2026, 2, 3).toISOString(), now, "en")).toBe("Mar 3");
    expect(noteTimestamp(new Date(2025, 2, 3).toISOString(), now, "en")).toBe("Mar 3, 2025");
  });

  it("follows the locale", () => {
    expect(noteTimestamp(new Date(2026, 2, 3).toISOString(), now, "de")).toBe("3. März");
  });

  it("is empty for a date it cannot read", () => {
    expect(noteTimestamp("not a date", now, "en")).toBe("");
  });
});
