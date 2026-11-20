import type { PeriodReport } from "./period-report";
import { reportKey } from "./report-period";

let latest: { id: string; scope: string; report: PeriodReport } | null = null;

/** Keep the displayed report in memory. Only its opaque id goes into navigation state. */
export function rememberReportForShare(scope: string | null, report: PeriodReport) {
  if (scope === null) return undefined;
  const id = crypto.randomUUID();
  latest = { id, scope, report };
  return id;
}

export function findReportForShare(
  scope: string | null,
  key: string,
  id: string | undefined,
): PeriodReport | null {
  return latest &&
    id === latest.id &&
    scope === latest.scope &&
    key === reportKey(latest.report.period)
    ? latest.report
    : null;
}
