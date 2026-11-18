import { useWeight } from "@/body";
import type { SessionDetail } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePreferences } from "@/preferences";

import {
  useNotificationPermission,
  notificationPermissionAsked,
} from "@/platform/notifications/permission-store";
import { useInstallId } from "@/session/shared/use-install-id";
import { useLoggingState } from "./use-logging-state";
import { useOptimisticSession } from "./use-optimistic-session";
import { usePreviousSets } from "./use-previous-sets";
import { useSessionActions } from "@/session/screen/use-session-actions";
import { useAutoWarmups } from "@/session/warmups/use-auto-warmups";

/**
 * Everything a screen that logs a live Session needs before it draws: the Session with ticks and
 * Rest changes shown at once, who owns it, Previous values, the logging state (ticks, keypad,
 * timers) and whether to ask about Rest notifications after the first Rest. The sets view and the
 * Timer both use it, so they log the same way.
 */
export function useSessionLogging(stored: SessionDetail) {
  // Ticks and Rest changes show at once; the database's watch catches up a moment later.
  const { session, actions } = useOptimisticSession(stored, useSessionActions());
  const { preferences, setUi, isLoading: preferencesLoading } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const effortScale = preferences.ui.effortScale;
  const bodyweightKg = useWeight().bodyweightOn(session.startedAt);
  const installId = useInstallId();

  // Ownership: another device's Session is read-only. A device that had it and lost it says so.
  const mine = installId !== null && session.deviceId === installId;
  const hadIt = useRef(false);
  useEffect(() => {
    if (mine) hadIt.current = true;
  }, [mine]);
  const readOnly = session.finishedAt === null && !mine;

  const exerciseIds = useMemo(
    () => session.exercises.map((entry) => entry.exerciseId),
    [session.exercises],
  );
  const {
    history: previous,
    ready: historyReady,
    failed: historyFailed,
    retry: retryHistory,
  } = usePreviousSets(exerciseIds);

  // Before the first Rest: our one-line explanation, then the system's dialog. Asked once.
  const permission = useNotificationPermission();
  const [askOpen, setAskOpen] = useState(false);
  const onRestStarted = useCallback(() => {
    if (permission === "undetermined" && !notificationPermissionAsked()) setAskOpen(true);
  }, [permission]);
  const logging = useLoggingState({
    session,
    previous,
    historyReady,
    unit,
    effortScale,
    bodyweightKg,
    weightIncrementKg: preferences.ui.weightIncrementKg,
    lighterWeeks: preferences.ui.lighterWeeks,
    readOnly,
    actions,
    onRestStarted,
  });

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
    readOnly,
    actions,
    editsPending: logging.editsPending,
    flushEdits: logging.flush,
  });

  return {
    session,
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
    exerciseIds,
    historyReady,
    historyFailed,
    retryHistory,
    logging,
    askOpen,
    setAskOpen,
  };
}
