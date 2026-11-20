import { describe, expect, it } from "vitest";

import {
  parseReportKey,
  previousReport,
  reportCardPeriod,
  reportContaining,
  reportEnd,
  reportKey,
} from "./report-period";

const day = (year: number, month: number, date: number) => Date.UTC(year, month - 1, date);

describe("report periods", () => {
  it("round-trips keys", () => {
    const month = { kind: "month", start: day(2026, 10, 1) } as const;
    expect(reportKey(month)).toBe("2026-10");
    expect(parseReportKey("2026-10")).toEqual(month);
    expect(parseReportKey("2026")).toEqual({ kind: "year", start: day(2026, 1, 1) });
    expect(reportKey({ kind: "year", start: day(2026, 1, 1) })).toBe("2026");
  });

  it("rejects keys that are not periods", () => {
    for (const key of ["", "2026-13", "2026-00", "26", "2026-1", "abc"])
      expect(parseReportKey(key)).toBeNull();
  });

  it("ends a period on the next one and steps back across a year", () => {
    expect(reportEnd({ kind: "month", start: day(2026, 12, 1) })).toBe(day(2027, 1, 1));
    expect(previousReport({ kind: "month", start: day(2026, 1, 1) }).start).toBe(day(2025, 12, 1));
    expect(previousReport({ kind: "year", start: day(2026, 1, 1) }).start).toBe(day(2025, 1, 1));
  });

  it("finds the period of a day", () => {
    expect(reportContaining("month", day(2026, 11, 20)).start).toBe(day(2026, 11, 1));
    expect(reportContaining("year", day(2026, 11, 20)).start).toBe(day(2026, 1, 1));
  });

  it("offers last month's report in the first seven days only", () => {
    expect(reportCardPeriod(day(2026, 11, 7))).toEqual({ kind: "month", start: day(2026, 10, 1) });
    expect(reportCardPeriod(day(2026, 11, 1))).toEqual({ kind: "month", start: day(2026, 10, 1) });
    expect(reportCardPeriod(day(2026, 11, 8))).toBeNull();
  });

  it("offers the Year in review in January", () => {
    expect(reportCardPeriod(day(2027, 1, 3))).toEqual({ kind: "year", start: day(2026, 1, 1) });
    expect(reportCardPeriod(day(2027, 1, 9))).toBeNull();
  });
});
