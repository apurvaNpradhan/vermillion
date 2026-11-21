import { describe, expect, it } from "vitest";

import { buildPeriodReport } from "./period-report";
import { findReportForShare, rememberReportForShare } from "./report-share-snapshot";

describe("report share snapshot", () => {
  it("reuses the displayed report for its route and account", () => {
    const start = Date.UTC(2026, 9, 1);
    const report = buildPeriodReport({
      period: { kind: "month", start },
      sessions: [],
      exercises: [],
      goal: null,
      weekStart: "monday",
      timezone: "UTC",
      today: start,
    });

    const id = rememberReportForShare("account-a", report);
    expect(findReportForShare("account-a", "2026-10", id)).toBe(report);
    expect(findReportForShare("account-b", "2026-10", id)).toBeNull();
    expect(findReportForShare(null, "2026-10", id)).toBeNull();
    expect(findReportForShare("account-a", "2026-11", id)).toBeNull();
    expect(findReportForShare("account-a", "2026-10", undefined)).toBeNull();
  });
});
