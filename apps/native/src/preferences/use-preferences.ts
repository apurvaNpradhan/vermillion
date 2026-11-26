import {
  phaseOwner,
  readPreferences,
  savePreferences,
  type PreferencesDatabase,
} from "@workspace/sync";
import {
  DEFAULT_UI_PREFERENCES,
  isHintVisible,
  type HintId,
  type Locale,
  type MuscleGoal,
  type Preferences,
  type TargetMuscle,
  type UiPreferencesPatch,
  type UpdatePreferences,
} from "@workspace/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { resolveDeviceLocale, useLocale, useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useSession } from "@/auth";
import { useLocalData, useSyncValue } from "@/sync";

import { preferencesAccess, type PreferencesAccess } from "./preferences-access";
import { preferencesStore, publishPreferences } from "./preferences-store";

const EMPTY: Preferences = { locale: null, timezone: null, ui: DEFAULT_UI_PREFERENCES };
/** A save found no usable local database or access (blocked by another owner, or still opening). */
class StorageUnavailableError extends Error {
  constructor() {
    super("Storage unavailable");
    this.name = "StorageUnavailableError";
  }
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
  const access = useMemo(
    () => preferencesAccess({ sessionUser, owner, installId, blocked: blockedPhase }),
    [sessionUser, owner, installId, blockedPhase],
  );
  const database: PreferencesDatabase | null = local?.status === "ready" ? local.database : null;
  const blocked = blockedPhase || (sessionUser !== null && owner !== null && sessionUser !== owner);
  return { local, database, access, blocked, sessionUser };
}

function useLocalPreferences() {
  const { local, database, access, blocked, sessionUser } = useLocalPreferencesGate();
  const state = useStore(preferencesStore(database, access));
  return {
    database,
    access,
    sessionUser,
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

function usePreferenceSave(
  database: PreferencesDatabase | null,
  access: PreferencesAccess | null,
  lifecycle: ReturnType<typeof useLocalPreferences>["lifecycle"],
  sessionUser: string | null,
) {
  // The newest session user, read when the write transaction runs, not when the save started.
  const sessionUserRef = useRef(sessionUser);
  sessionUserRef.current = sessionUser;

  return useCallback(
    async (patch: UpdatePreferences, derive?: (current: Preferences) => UpdatePreferences) => {
      if (!database || !access) throw new StorageUnavailableError();
      await savePreferences(
        database,
        patch,
        {
          installId: access.installId,
          owner: access.owner,
          // Recheck scope inside the transaction in case the account locked or switched.
          isAuthorized: () => {
            const phase = lifecycle?.getSnapshot().phase;
            if (!phase || phase.kind === "blocked") return false;
            const user = sessionUserRef.current;
            return user === null || user === access.owner;
          },
        },
        derive,
      );
      publishPreferences(database, access, await readPreferences(database, access.owner));
    },
    [database, access, lifecycle],
  );
}

/** Watch just this hint's visibility and keep its action stable across preference updates. */
export function useHintPreference(id: HintId) {
  const { database, access, local, sessionUser } = useLocalPreferencesGate();
  const store = preferencesStore(database, access);
  const save = usePreferenceSave(
    database,
    access,
    local?.status === "ready" ? local.lifecycle : null,
    sessionUser,
  );
  const visibleLocally = useStore(
    store,
    ({ value }) => value !== undefined && isHintVisible(value.ui.dismissedHints, id),
  );
  // An empty database on a new phone initially reads as defaults, even for an existing account.
  const hasSynced = useSyncValue((snapshot) => snapshot?.hasSynced === true);
  const [confirmed, setConfirmed] = useState<typeof store | null>(null);
  useEffect(() => {
    if (!hasSynced || !database || !access) return;
    let active = true;
    const before = store.getState();
    // The first checkpoint can arrive before the SQLite watch publishes its new result.
    void readPreferences(database, access.owner)
      .then((value) => {
        if (!active) return;
        if (store.getState() === before) publishPreferences(database, access, value);
        setConfirmed(store);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hasSynced, database, access, store]);
  const dismiss = useCallback(() => {
    if (!isHintVisible(store.getState().value?.ui.dismissedHints ?? [], id)) return;
    void save({ hintDismissal: id }, (current) =>
      isHintVisible(current.ui.dismissedHints, id) ? { hintDismissal: id } : {},
    ).catch(() => undefined);
  }, [store, save, id]);
  return { visible: hasSynced && confirmed === store && visibleLocally, dismiss };
}

/** Reads the device's preferences and saves changes locally before queuing their upload. */
export function usePreferences() {
  const { database, access, state, lifecycle, unavailable, sessionUser } = useLocalPreferences();
  const write = usePreferenceSave(database, access, lifecycle, sessionUser);
  const [saving, setSaving] = useState(0);
  const { setDeviceLocale } = useLocale();
  const timeZone = useDeviceTimeZone();
  const save = async (
    patch: UpdatePreferences,
    derive?: (current: Preferences) => UpdatePreferences,
  ) => {
    setSaving((count) => count + 1);
    try {
      await write(patch, derive);
    } finally {
      setSaving((count) => count - 1);
    }
  };
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
    updateUi: (derive: (current: Preferences["ui"]) => UiPreferencesPatch | null) =>
      save({}, ({ ui }) => {
        const patch = derive(ui);
        return patch ? { ui: patch } : {};
      }),
    resetHintDismissals: () => save({ hintDismissal: "reset" }),
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
