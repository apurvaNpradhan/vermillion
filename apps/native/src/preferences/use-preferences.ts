import {
  phaseOwner,
  readPreferences,
  savePreferences,
  type PreferencesDatabase,
} from "@workspace/sync";
import {
  DEFAULT_UI_PREFERENCES,
  type Locale,
  type MuscleGoal,
  type Preferences,
  type TargetMuscle,
  type UiPreferencesPatch,
  type UpdatePreferences,
} from "@workspace/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useSession } from "@/auth";
import { useLocalData, useSyncValue } from "@/sync";

import { preferencesAccess, type PreferencesAccess } from "./preferences-access";
import { preferencesStore, publishPreferences } from "./preferences-store";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };
/** Reads the row just written and publishes it, so no reader sees the snapshot from before. */
async function showSaved(database: PreferencesDatabase, access: PreferencesAccess) {
  publishPreferences(database, access, await readPreferences(database, access.owner));
}

/**
 * The preferences read from the device's database, or `undefined` before it has answered. Only
 * for the Device owner (`preferencesAccess`): another account's session reads nothing.
 */
function useLocalPreferencesGate() {
  const local = useLocalData();
  const { session } = useSession();
  const owner = useSyncValue((snapshot) => (snapshot ? phaseOwner(snapshot.phase) : null));
  const installId = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const sessionUser = session?.user.id ?? null;
  const blockedPhase = useSyncValue((snapshot) => snapshot?.phase.kind === "blocked");
  const access = preferencesAccess({ sessionUser, owner, installId, blocked: blockedPhase });
  const database: PreferencesDatabase | null = local?.status === "ready" ? local.database : null;
  const blocked = blockedPhase || (sessionUser !== null && owner !== null && sessionUser !== owner);
  return { local, database, access, blocked };
}

function useLocalPreferences() {
  const { local, database, access, blocked } = useLocalPreferencesGate();
  const state = useStore(preferencesStore(database, access));
  return {
    database,
    access,
    state,
    lifecycle: local?.status === "ready" ? local.lifecycle : null,
    unavailable: local?.status === "unavailable" || blocked,
  };
}

/**
 * One value read from the preferences, re-rendering only when it changes by `isEqual` (default
 * `Object.is`). Use it where a component needs a field or two: the preferences row is replaced
 * on every change to any setting, and `usePreferences` hands everyone the whole object. A
 * selector that builds an object needs an `isEqual` (`shallow` from zustand does for flat ones).
 */
export function usePreference<T>(
  select: (preferences: Preferences) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const { database, access } = useLocalPreferencesGate();
  return useStoreWithEqualityFn(
    preferencesStore(database, access),
    (state) => select(state.value ?? EMPTY),
    isEqual,
  );
}

/**
 * The one hook every component uses to read and change the user's preferences. They live in the
 * device's database (ADR 0049): reads answer from SQLite in milliseconds with or without a
 * connection, and a change is shown at once, queued, and uploaded when the device is online.
 */
export function usePreferences() {
  const { database, access, state, lifecycle, unavailable } = useLocalPreferences();
  const { session } = useSession();
  // The newest session user, read when the write transaction runs, not when the save started.
  const sessionUserRef = useRef<string | null>(null);
  sessionUserRef.current = session?.user.id ?? null;
  const [saving, setSaving] = useState(0);
  const { setDeviceLocale } = useLocale();
  const timeZone = useDeviceTimeZone();

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
          // Rechecked inside the write transaction: a lock or another account that arrived after
          // the save was captured must not let it through.
          isAuthorized: () => {
            const phase = lifecycle?.getSnapshot().phase;
            if (!phase || phase.kind === "blocked") return false;
            const user = sessionUserRef.current;
            return user === null || user === access.owner;
          },
        });
        // Shown at once: the next step reads this, not a watch that has not answered yet.
        await showSaved(database, access);
      } finally {
        setSaving((count) => count - 1);
      }
    },
    [database, access, session, lifecycle],
  );
  const quietly = (patch: UpdatePreferences) => void save(patch).catch(() => undefined);

  return {
    // The stored `timezone` is never read: the app always uses the device's zone.
    preferences: state.value ?? EMPTY,
    /** The device's time zone, which every date in the app uses. */
    timeZone,
    /** True only until the device's database has answered (milliseconds), never on the network. */
    isLoading: !unavailable && !state.failed && state.value === undefined,
    hasPreferences: state.value !== undefined,
    isSaving: saving > 0,
    /** Account language, remembered on this device too. `null` follows the phone again. */
    setLocale: (locale: Locale | null) => {
      setDeviceLocale(locale);
      quietly({ locale });
    },
    /** Saves some of the `ui` preferences (weight unit, effort scale, default rest). */
    setUiAsync: (ui: UiPreferencesPatch) => save({ ui }),
    setUi: (ui: UiPreferencesPatch) => quietly({ ui }),
    /** Changes one muscle's goal (`null` resets it) without touching the others. */
    setMuscleGoal: (muscle: TargetMuscle, goal: MuscleGoal | null) =>
      quietly({ muscleGoalChanges: { [muscle]: goal } }),
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
