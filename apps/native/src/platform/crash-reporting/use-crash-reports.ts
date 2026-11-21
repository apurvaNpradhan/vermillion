import { useSyncExternalStore } from "react";

import { deviceStorage } from "../storage";
import { applyCrashReportsChoice, crashReportingConfigured } from "./client";
import { CRASH_REPORTS_KEY, crashReportsEnabled } from "./gate";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => crashReportsEnabled(deviceStorage.get(CRASH_REPORTS_KEY));

/** The per-device "Send crash reports" choice; on by default. `available` is false without a DSN. */
export function useCrashReports() {
  const enabled = useSyncExternalStore(subscribe, snapshot);
  return {
    available: crashReportingConfigured,
    enabled,
    set: (next: boolean) => {
      deviceStorage.set(CRASH_REPORTS_KEY, String(next));
      for (const listener of listeners) listener();
      void applyCrashReportsChoice(next);
    },
  };
}
