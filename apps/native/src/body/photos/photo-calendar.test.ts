import { describe, expect, it } from "vitest";
import { monthDays } from "./photo-calendar";

describe("photo calendar", () => {
  it("aligns Sunday weeks and includes leap day", () => {
    const days = monthDays("2024-02");
    expect(days).toHaveLength(42);
    expect(days.slice(0, 5)).toEqual([null, null, null, null, "2024-02-01"]);
    expect(days).toContain("2024-02-29");
    expect(days).not.toContain("2024-02-30");
    expect(monthDays("2025-02")).not.toContain("2025-02-29");
  });
  it("keeps a six-row month and year boundaries intact", () => {
    expect(monthDays("2026-08")[36]).toBe("2026-08-31");
    expect(monthDays("2026-12")).toContain("2026-12-31");
    expect(monthDays("2027-01")).toContain("2027-01-01");
  });
});
