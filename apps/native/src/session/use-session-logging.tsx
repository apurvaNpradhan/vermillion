import type { SessionDetail } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePreferences } from "@/preferences";

import { useRestPermission, restPermissionAsked } from "./rest-permission-store";
import { useInstallId } from "./use-install-id";
import { useLoggingState } from "./use-logging-state";
import { useOptimisticSession } from "./use-optimistic-session";
import { usePreviousSets } from "./use-previous-sets";
import { useSessionActions } from "./use-session-actions";

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
  const bodyweightKg = preferences.ui.bodyweightKg;
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
  const permission = useRestPermission();
  const [askOpen, setAskOpen] = useState(false);
  const onRestStarted = useCallback(() => {
    if (permission === "undetermined" && !restPermissionAsked()) setAskOpen(true);
  }, [permission]);
  const logging = useLoggingState({
    session,
    previous,
    historyReady,
    unit,
    effortScale,
    bodyweightKg,
    weightIncrementKg: preferences.ui.weightIncrementKg,
    readOnly,
    actions,
    onRestStarted,
  });

  return {
    session,
    actions,
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
