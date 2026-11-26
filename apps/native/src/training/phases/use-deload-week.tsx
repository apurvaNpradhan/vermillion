import {
  activeLighterWeek,
  endLighterWeek,
  runWeek,
  startLighterWeek,
  undoableDeloadWeek,
  undoableLighterWeek,
  type RunPause,
  type RunSessionPhase,
} from "@workspace/shared";
import { insertDeloadNow, undoDeloadNow } from "@workspace/sync";
import { useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";
import { useTrainingWrite } from "@/training/shared/use-training-write";

type DeloadRun = {
  id: string;
  started_at: string | null;
  inserted_deloads: readonly number[];
  pauses?: readonly RunPause[];
};

/**
 * "Deload this week" and "Undo deload", the one pair for both cases. With an active Run it adds
 * (or takes back) an inserted Deload week; without one it starts (or ends) a Lighter week for the
 * next seven days. `sessions` are the counted Sessions of the Run with their phases (an undo stops
 * once one was started as the Deload), and `sessionStarts` the start of recent Sessions, which
 * decide whether a Lighter week may still be undone.
 * Render `dialog` next to the control that calls `ask`.
 */
export function useDeloadWeek({
  run,
  sessions = [],
  sessionStarts,
}: {
  /** The active Run (null when there is none). */
  run: DeloadRun | null;
  sessions?: readonly RunSessionPhase[];
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
  const undoRunWeek = run ? undoableDeloadWeek({ run, now, timezone: timeZone, sessions }) : null;
  const lighter = activeLighterWeek(lighterWeeks, now);
  const canUndoLighter =
    sessionStarts !== undefined && undoableLighterWeek(lighterWeeks, now, sessionStarts) !== null;

  const undo = async () => {
    if (!run || undoRunWeek === null) return;
    const done = await write(
      (db) => undoDeloadNow(db, run.id, undoRunWeek, timeZone, writeScope),
      false,
    );
    if (done) toast.show({ label: t("deload__undone_toast") });
  };

  const endLighter = () => {
    const at = new Date();
    if (!activeLighterWeek(lighterWeeks, at)) return;
    const undone =
      sessionStarts !== undefined && undoableLighterWeek(lighterWeeks, at, sessionStarts) !== null;
    setUi(endLighterWeek(lighterWeeks, at));
    if (undone) toast.show({ label: t("deload__undone_toast") });
  };

  const insert = async () => {
    const at = new Date();
    if (run) {
      const week = runWeek(run.started_at, at, timeZone, run.pauses);
      return write((db) => insertDeloadNow(db, run.id, week, writeScope), false);
    }
    if (activeLighterWeek(lighterWeeks, at)) return false;
    setUi(startLighterWeek(lighterWeeks, at));
    return true;
  };

  return {
    /** An Undo deload is allowed now. */
    canUndo: undoRunWeek !== null,
    lighter,
    canUndoLighter,
    endLighter,
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
          void insert().then((done) => {
            if (!done) return;
            haptic.confirm();
            toast.show({ label: t("deload__done_toast") });
          });
        }}
      />
    ),
  };
}
