import type { Preferences, UpdatePreferences } from "@workspace/shared";

/**
 * What the server will store after `patch`, so the screen can show it before
 * the response arrives. Mirrors the server's rule: `undefined` leaves a field,
 * `null` clears it, and `ui` is merged key by key.
 */
export function applyPreferencesPatch(current: Preferences, patch: UpdatePreferences): Preferences {
  return {
    locale: patch.locale === undefined ? current.locale : patch.locale,
    timezone: patch.timezone === undefined ? current.timezone : patch.timezone,
    ui: { ...current.ui, ...stripUndefined(patch.ui) },
  };
}

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {};
  // SAFETY: filtering out undefined values keeps every remaining key of T.
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
