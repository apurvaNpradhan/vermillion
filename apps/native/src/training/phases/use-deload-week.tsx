import {
  activeLighterWeek,
  endLighterWeek,
  runWeek,
  startLighterWeek,
  undoableDeloadWeek,
  undoableLighterWeek,
  type RunPause,
} from "@workspace/shared";
import { insertDeloadNow, undoDeloadNow } from "@workspace/sync";
import { useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";
import { UNDO_MS, useTrainingWrite } from "@/training/shared/use-training-write";

type DeloadRun = {
  id: string;
  started_at: string | null;
  inserted_deloads: readonly number[];
  pauses?: readonly RunPause[];
};

/**
 * "Deload this week" and "Undo deload", the one pair for both cases. With an active Run it adds
 * (or takes back) an inserted Deload week; without one it starts (or ends) a Lighter week for the
 * next seven days. `trainedAt` is the start of each counted Session of the Run, and
 * `sessionStarts` the start of recent Sessions, which decide whether an undo is still allowed.
 * Render `dialog` next to the control that calls `ask`.
 */
export function useDeloadWeek({
  run,
  trainedAt = [],
  sessionStarts = [],
}: {
  /** The active Run (null when there is none). */
  run: DeloadRun | null;
  trainedAt?: readonly string[];
  sessionStarts?: readonly string[];
}) {
  const { t } = useTranslation();
  const { write, writeScope } = useTrainingWrite();
  const timeZone = useDeviceTimeZone();
  const { toast } = useAppToast();
  const { preferences, setUi } = usePreferences();
  const [open, setOpen] = useState(false);
  const { lighterWeeks } = preferences.ui;
  const now = new Date();
  const undoRunWeek = run ? undoableDeloadWeek({ run, now, timezone: timeZone, trainedAt }) : null;
  const lighter = run ? null : activeLighterWeek(lighterWeeks, now);
  const canUndo = run
    ? undoRunWeek !== null
    : lighter !== null && undoableLighterWeek(lighterWeeks, now, sessionStarts) !== null;

  const undo = async () => {
    if (run) {
      if (undoRunWeek === null) return;
      const done = await write((db) => undoDeloadNow(db, run.id, undoRunWeek, writeScope), false);
      if (done) toast.show({ label: t("deload__undone_toast") });
      return;
    }
    if (!canUndo) return;
    setUi(endLighterWeek(lighterWeeks, new Date()));
    toast.show({ label: t("deload__undone_toast") });
  };

  /** Starts the deload and returns what takes it back, or null when nothing was started. */
  const insert = async (): Promise<(() => Promise<void> | void) | null> => {
    if (run) {
      const week = runWeek(run.started_at, new Date(), timeZone, run.pauses);
      const done = await write((db) => insertDeloadNow(db, run.id, week, writeScope), false);
      return done
        ? async () => {
            await write((db) => undoDeloadNow(db, run.id, week, writeScope), false);
          }
        : null;
    }
    const started = startLighterWeek(lighterWeeks, new Date());
    setUi(started);
    return () => setUi(endLighterWeek(started.lighterWeeks, new Date()));
  };

  return {
    /** An Undo deload is allowed now. */
    canUndo,
    ask: () => setOpen(true),
    undo,
    dialog: (
      <ConfirmationDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={t("deload__title")}
        description={t(run ? "deload__body_run" : "deload__body_none")}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("deload__confirm")}
        onConfirm={() => {
          void insert().then((takeBack) => {
            if (!takeBack) return;
            haptic.confirm();
            toast.show({
              label: t("deload__done_toast"),
              actionLabel: t("common__undo"),
              duration: UNDO_MS,
              onActionPress: ({ hide }) => {
                hide();
                void takeBack();
              },
            });
          });
        }}
      />
    ),
  };
}
