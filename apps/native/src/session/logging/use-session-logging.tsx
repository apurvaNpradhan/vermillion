import { useWeight } from "@/body";
import type { SessionDetail } from "@workspace/sync";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { usePreferences } from "@/preferences";

import {
  useNotificationPermission,
  notificationPermissionAsked,
} from "@/platform/notifications/permission-store";
import { useInstallId } from "@/session/shared/use-install-id";
import { createSessionStore, type SessionStore } from "@/session/store/session-store";
import { useLoggingState } from "./use-logging-state";
import { useOptimisticSession } from "./use-optimistic-session";
import { useRecordBests } from "./use-record-bests";
import { usePreviousSets } from "./use-previous-sets";
import { useSessionActions } from "@/session/screen/use-session-actions";
import { useAutoWarmups } from "@/session/warmups/use-auto-warmups";
import { useGymLoads, useLoggedLoad } from "@/gym";

/**
 * The store of one live Session, made with its screen and fed by the database's watch. Changes the
 * watch brings that the store already shows (the pending tick, once saved) leave it as it was.
 */
export function useFedSessionStore(stored: SessionDetail): SessionStore {
  const [store] = useState(() => createSessionStore(stored));
  useLayoutEffect(() => {
    store.getState().setStored(stored);
  }, [store, stored]);
  return store;
}

/**
 * Everything a screen that logs a live Session needs before it draws, over a store the screen made
 * itself so it can share it with its rows: the Session with ticks and Rest changes shown at once,
 * who owns it, Previous values, the logging state (ticks, keypad, timers) and whether to ask about
 * Rest notifications after the first Rest.
 */
export function useSessionLoggingIn(store: SessionStore, editor = false) {
  // Ticks and Rest changes show at once; the database's watch catches up a moment later.
  const actions = useOptimisticSession(store, useSessionActions());
  const session = useStore(store, (state) => state.session);
  const { preferences, setUi, isLoading: preferencesLoading } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const effortScale = preferences.ui.effortScale;
  const weight = useWeight();
  const bodyweightKg = weight.bodyweightOn(session.startedAt);
  const installId = useInstallId();

  // Ownership: another device's Session is read-only. A device that had it and lost it says so.
  const mine = installId !== null && session.deviceId === installId;
  const hadIt = useRef(false);
  useEffect(() => {
    if (mine) hadIt.current = true;
  }, [mine]);
  const readOnly = (editor && installId === null) || (session.finishedAt === null && !mine);

  const libraryIds = useMemo(
    () => session.exercises.map((entry) => entry.exerciseId),
    [session.exercises],
  );
  const {
    history: previous,
    ready: historyReady,
    failed: historyFailed,
    retry: retryHistory,
  } = usePreviousSets(libraryIds);

  // The Session's gym sets caps, steps, the setup note, the kit and the warm-up rounding; a Session
  // with none reads the gym trained at. Its history reads this gym only (none: every gym).
  const sessionGymId = session.gymId ?? null;
  const gym = useGymLoads(sessionGymId);
  const onLoggedLoad = useLoggedLoad(gym);
  const { recordAlerts, sounds, soundMilestones } = preferences.ui;
  const recordBests = useRecordBests(
    session,
    libraryIds,
    !readOnly && (recordAlerts || (sounds && soundMilestones)),
    weight.withBodyweight,
  );

  // Before the first Rest: our one-line explanation, then the system's dialog. Asked once.
  const permission = useNotificationPermission();
  const [askOpen, setAskOpen] = useState(false);
  const onRestStarted = useCallback(() => {
    if (permission === "undetermined" && !notificationPermissionAsked()) setAskOpen(true);
  }, [permission]);
  const { durationFormat, distanceUnit } = preferences.ui;
  const display = useMemo(() => ({ durationFormat, distanceUnit }), [durationFormat, distanceUnit]);
  const logging = useLoggingState({
    store,
    editor,
    previous,
    recordBests,
    historyReady,
    historyFailed,
    prescriptionReady: !preferencesLoading && !weight.loading && gym.ready === true,
    unit,
    display,
    effortScale,
    bodyweightKg,
    weightIncrementKg: preferences.ui.weightIncrementKg,
    weightIncrementUnit: preferences.ui.weightIncrementUnit,
    gym,
    sessionGymId,
    lighterWeeks: preferences.ui.lighterWeeks,
    recordAlerts,
    previousSource: preferences.ui.previousSource,
    countWarmups: preferences.ui.countWarmups,
    readOnly,
    actions,
    onRestStarted,
    onLoggedLoad,
  });

  const { warmupSteps, warmupRounding } = preferences.ui;
  // Stable between renders, so the automatic ramp is not looked at again for nothing.
  const warmupSettings = useMemo(
    () => ({ steps: warmupSteps, rounding: warmupRounding }),
    [warmupSteps, warmupRounding],
  );
  const { ghostsFor } = logging;
  const ghostWeightOf = useCallback(
    (setId: string) => ghostsFor(setId).weight ?? null,
    [ghostsFor],
  );
  const { addWarmups } = useAutoWarmups({
    session,
    ghostWeightOf,
    historyReady,
    unit,
    weightIncrementKg: preferences.ui.weightIncrementKg,
    weightIncrementUnit: preferences.ui.weightIncrementUnit,
    warmupSettings,
    readOnly,
    actions,
    editsPending: logging.editsPending,
    flushEdits: logging.flush,
    gym,
  });

  return {
    session,
    sessionGymId,
    actions,
    addWarmups,
    preferences,
    setUi,
    preferencesLoading,
    unit,
    effortScale,
    bodyweightKg,
    installId,
    mine,
    hadIt,
    readOnly,
    /** The library ids of the Session's exercises (what the picker excludes). */
    exerciseIds: libraryIds,
    historyReady,
    historyFailed,
    retryHistory,
    logging,
    askOpen,
    setAskOpen,
  };
}
