/** Why an onboarding save failed, as the i18n key of the message to show. */
export type PrefsFailure = "onboarding__prefs_failed" | "onboarding__prefs_unavailable";

/** `StorageUnavailableError.name` from `@/preferences`, matched by name to keep this file pure. */
const STORAGE_UNAVAILABLE = "StorageUnavailableError";

/** Storage that cannot be written (another account owns the device) is not a connection problem. */
export function prefsFailureOf(error: Error): PrefsFailure {
  return error.name === STORAGE_UNAVAILABLE
    ? "onboarding__prefs_unavailable"
    : "onboarding__prefs_failed";
}
