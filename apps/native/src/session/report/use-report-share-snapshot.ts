import { useLocalData, useSyncValue } from "@/sync";

import type { PeriodReport } from "./period-report";
import { findReportForShare, rememberReportForShare } from "./report-share-snapshot";

export function usePrepareReportShare() {
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  return (report: PeriodReport) => rememberReportForShare(scope, report);
}

export function useReportShareSnapshot(key: string, id: string | undefined) {
  const loading = useLocalData() === null;
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  return {
    pending: id !== undefined && loading,
    report: findReportForShare(scope, key, id),
  };
}
