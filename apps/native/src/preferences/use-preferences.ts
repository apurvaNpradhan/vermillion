import { savePreferences, type PreferencesDatabase } from "@workspace/sync";
import {
  DEFAULT_UI_PREFERENCES,
  type Locale,
  type Preferences,
  type UiPreferencesPatch,
  type UpdatePreferences,
} from "@workspace/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncValue } from "@/sync";

import { preferencesSnapshot, subscribePreferences } from "./preferences-store";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };
const NO_DATABASE = { value: undefined, failed: false } as const;
const never = () => () => undefined;

/** The preferences read from the device's database, or `undefined` before it has answered. */
function useLocalPreferences() {
  const local = useLocalData();
  const database: PreferencesDatabase | null = local?.status === "ready" ? local.database : null;
  const state = useSyncExternalStore(
    useCallback(
      (listener: () => void) => (database ? subscribePreferences(database, listener) : never()),
      [database],
    ),
    () => (database ? preferencesSnapshot(database) : NO_DATABASE),
  );
  return { database, state, unavailable: local?.status === "unavailable" };
}

/**
 * The one hook every component uses to read and change the user's preferences. They live in the
 * device's database (ADR 0049): reads answer from SQLite in milliseconds with or without a
 * connection, and a change is shown at once, queued, and uploaded when the device is online.
 */
export function usePreferences() {
  const { database, state, unavailable } = useLocalPreferences();
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const [saving, setSaving] = useState(0);
  const { setDeviceLocale } = useLocale();

  const save = useCallback(
    async (patch: UpdatePreferences) => {
      if (!database) throw new Error("Storage unavailable");
      setSaving((count) => count + 1);
      try {
        await savePreferences(database, patch, scope);
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [database, scope],
  );
  const quietly = (patch: UpdatePreferences) => void save(patch).catch(() => undefined);

  return {
    preferences: state.value ?? EMPTY,
    /** True only until the device's database has answered (milliseconds), never on the network. */
    isLoading: !unavailable && !state.failed && state.value === undefined,
    hasPreferences: state.value !== undefined,
    isSaving: saving > 0,
    /** Account language, remembered on this device too. `null` follows the phone again. */
    setLocale: (locale: Locale | null) => {
      setDeviceLocale(locale);
      quietly({ locale });
    },
    setTimezone: (timezone: string | null) => quietly({ timezone }),
    /** Saves some of the `ui` preferences (weight unit, effort scale, default rest). */
    setUiAsync: (ui: UiPreferencesPatch) => save({ ui }),
    setUi: (ui: UiPreferencesPatch) => quietly({ ui }),
  };
}

/**
 * Applies the account language when the signed-in app opens and whenever it changes (another
 * device, or this one): saved preference, else this device's choice, else the phone's language.
 */
export function useAccountLocale() {
  const { i18n } = useTranslation();
  const { state } = useLocalPreferences();
  const saved = state.value?.locale;
  const known = state.value !== undefined;
  useEffect(() => {
    if (!known) return;
    const locale = resolveDeviceLocale(saved ?? null);
    if (i18n.language !== locale) void i18n.changeLanguage(locale).catch(() => undefined);
  }, [known, saved, i18n]);
}
