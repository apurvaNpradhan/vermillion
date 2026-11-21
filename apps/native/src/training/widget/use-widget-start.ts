import { beginSession, newSessionId } from "@workspace/sync";
import { useCallback } from "react";

import { useTranslation } from "@/platform/i18n";
import { useTrainingWrite } from "../shared/use-training-write";

/** The widget opens the Session selected by one scoped start-or-resume transaction. */
export function useWidgetStart() {
  const { t } = useTranslation();
  const { write, writeScope, isOpening } = useTrainingWrite();
  const startOrResume = useCallback(
    (workoutId: string) =>
      write(
        (db) =>
          beginSession(
            db,
            { workoutId },
            t("session__untitled"),
            { id: newSessionId(), resumeActive: true },
            writeScope,
          ),
        null,
      ),
    [t, write, writeScope],
  );
  return { isOpening, startOrResume };
}
