import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";

import type { useSessionActions } from "./use-session-actions";

/**
 * Finish and Discard with their bottom sheets, shared by the sets view and the Timer so both ask
 * the same questions. `askFinish` finishes at once when every set is ticked, otherwise asks first;
 * a workout with nothing ticked is offered as a discard (an empty finished workout is clutter).
 * Render `sheets` once on the screen.
 */
export function useFinishFlow({
  session,
  title,
  ticked,
  unticked,
  actions,
  flush,
  closeKeypad,
  onMinimise,
  onFinished,
}: {
  session: { id: string; finishedAt: string | null };
  title: string;
  ticked: number;
  unticked: number;
  actions: Pick<ReturnType<typeof useSessionActions>, "discard">;
  /** Saves what is typed in the keypad's cell. */
  flush: () => void;
  closeKeypad: () => void;
  /** The Session is gone (discarded): leave the screen. */
  onMinimise: () => void;
  onFinished: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const finish = async () => {
    flush();
    if (ticked === 0 && session.finishedAt === null) {
      // Nothing was logged: a finished empty Session would only be clutter, so it is discarded.
      if (await actions.discard(session.id, title)) onMinimise();
      return;
    }
    onFinished(session.id);
  };

  const askFinish = () => {
    flush();
    if (ticked === 0 || unticked > 0) setConfirmFinish(true);
    else void finish();
  };

  const sheets = (
    <>
      <ConfirmSheet
        isOpen={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t("session__discard_confirm_title")}
        description={t("session__discard_confirm_body", { count: ticked })}
        cancelLabel={t("session__keep_logging")}
        confirmLabel={t("session__discard_workout")}
        destructive
        onConfirm={() => {
          if (discarding) return;
          setDiscarding(true);
          closeKeypad();
          void actions.discard(session.id, title).then((ok) => {
            setDiscarding(false);
            if (ok) onMinimise();
          });
        }}
      />
      <ConfirmSheet
        isOpen={confirmFinish}
        onOpenChange={setConfirmFinish}
        title={t(ticked === 0 ? "session__discard_empty_title" : "session__finish_title")}
        description={
          ticked === 0
            ? t("session__discard_empty_body")
            : t("session__finish_unticked", { count: unticked })
        }
        cancelLabel={t("session__keep_logging")}
        destructive={ticked === 0}
        confirmLabel={t(ticked === 0 ? "session__discard" : "session__finish")}
        onConfirm={() => void finish()}
        {...(ticked === 0 || session.finishedAt !== null
          ? {}
          : {
              extraLabel: t("session__discard_workout"),
              onExtra: () => setConfirmDiscard(true),
            })}
      />
    </>
  );
  return { askFinish, askDiscard: () => setConfirmDiscard(true), sheets };
}
