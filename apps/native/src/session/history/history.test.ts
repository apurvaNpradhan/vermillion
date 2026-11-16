import { describe, expect, it } from "vitest";
import { isoWeekKey, groupSessionWeeks } from "./history";
describe("ISO weeks in the account zone", () => {
  it("puts a UTC Monday into the previous week west of UTC", () => {
    expect(isoWeekKey("2026-01-05T00:30:00Z", "America/Los_Angeles")).toBe("2025-12-29");
    expect(isoWeekKey("2026-01-05T00:30:00Z", "Asia/Kolkata")).toBe("2026-01-05");
  });
  it("keeps spring DST Sunday in one week", () => {
    for (const time of ["2026-03-08T09:30:00Z", "2026-03-08T10:30:00Z"])
      expect(isoWeekKey(time, "America/Los_Angeles")).toBe("2026-03-02");
  });
  it("keeps both fall repeated hours in one week", () => {
    for (const time of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"])
      expect(isoWeekKey(time, "America/Los_Angeles")).toBe("2026-10-26");
  });
  it("handles year boundaries and empty history", () => {
    expect(isoWeekKey("2027-01-01T12:00:00Z", "UTC")).toBe("2026-12-28");
    expect(groupSessionWeeks([], "UTC")).toEqual([]);
  });
});
