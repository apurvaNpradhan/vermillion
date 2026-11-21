import { useSyncStatus, useSyncValue } from "@/sync";

import type { PeriodReport } from "./period-report";
import { findReportForShare, rememberReportForShare } from "./report-share-snapshot";

export function usePrepareReportShare() {
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  return (report: PeriodReport) => rememberReportForShare(scope, report);
}

export function useReportShareSnapshot(key: string, id: string | undefined) {
  const { status, snapshot } = useSyncStatus();
  return {
    pending: id !== undefined && status === "loading",
    report: findReportForShare(snapshot?.writeScope ?? null, key, id),
  };
}
