import {
  phaseOwner,
  readPreferences,
  savePreferences,
  type PreferencesDatabase,
} from "@workspace/sync";
import {
  DEFAULT_UI_PREFERENCES,
  type Locale,
  type Preferences,
  type UiPreferencesPatch,
  type UpdatePreferences,
} from "@workspace/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { useSession } from "@/auth";
import { useLocalData, useSyncValue } from "@/sync";

import { preferencesAccess, type PreferencesAccess } from "./preferences-access";
import { preferencesSnapshot, publishPreferences, subscribePreferences } from "./preferences-store";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };
const NO_DATABASE = { value: undefined, failed: false } as const;
/** Reads the row just written and publishes it, so no reader sees the snapshot from before. */
async function showSaved(database: PreferencesDatabase, access: PreferencesAccess) {
  publishPreferences(database, access, await readPreferences(database, access.owner));
}

const never = () => () => undefined;

/**
 * The preferences read from the device's database, or `undefined` before it has answered. Only
 * for the Device owner (`preferencesAccess`): another account's session reads nothing.
 */
function useLocalPreferences() {
  const local = useLocalData();
  const { session } = useSession();
  const owner = useSyncValue((snapshot) => (snapshot ? phaseOwner(snapshot.phase) : null));
  const installId = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const sessionUser = session?.user.id ?? null;
  const access = preferencesAccess({ sessionUser, owner, installId });
  const database: PreferencesDatabase | null = local?.status === "ready" ? local.database : null;
  const gated = database && access ? { database, access } : null;
  const state = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        gated ? subscribePreferences(gated.database, gated.access, listener) : never(),
      // The cache entry, not the object, is what must stay stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [gated?.database, gated?.access.key],
    ),
    () => (gated ? preferencesSnapshot(gated.database, gated.access) : NO_DATABASE),
  );
  const blocked = sessionUser !== null && owner !== null && sessionUser !== owner;
  return { database, access, state, unavailable: local?.status === "unavailable" || blocked };
}

/**
 * The one hook every component uses to read and change the user's preferences. They live in the
 * device's database (ADR 0049): reads answer from SQLite in milliseconds with or without a
 * connection, and a change is shown at once, queued, and uploaded when the device is online.
 */
export function usePreferences() {
  const { database, access, state, unavailable } = useLocalPreferences();
  const { session } = useSession();
  const [saving, setSaving] = useState(0);
  const { setDeviceLocale } = useLocale();

  const save = useCallback(
    async (patch: UpdatePreferences) => {
      if (!database || !access) throw new Error("Storage unavailable");
      setSaving((count) => count + 1);
      try {
        // The screen's own user (or the owner while signed out) must still own the device when
        // the write transaction runs.
        await savePreferences(database, patch, {
          installId: access.installId,
          owner: session?.user.id ?? access.owner,
        });
        // Shown at once: the next step reads this, not a watch that has not answered yet.
        await showSaved(database, access);
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [database, access, session],
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
