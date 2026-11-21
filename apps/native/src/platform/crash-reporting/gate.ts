/** Where the "Send crash reports" choice is stored on this device. */
export const CRASH_REPORTS_KEY = "device.crashReports";
/** Where the random id that stands in for the user in crash reports is stored. */
export const ANONYMOUS_ID_KEY = "device.crashReportId";

/** The part of the device storage this module needs. */
export type KeyValueStore = {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
};

/** Reports are on unless the person turned them off: only an explicit "false" opts out. */
export function crashReportsEnabled(stored: string | null): boolean {
  return stored !== "false";
}

/**
 * The anonymous id of this install: a random id made once and kept on the device. It is never the
 * account id and carries no personal data, so reports from one device group together and nothing
 * more.
 */
export function readAnonymousId(store: KeyValueStore, makeId: () => string): string {
  const existing = store.get(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const created = makeId();
  store.set(ANONYMOUS_ID_KEY, created);
  return created;
}
