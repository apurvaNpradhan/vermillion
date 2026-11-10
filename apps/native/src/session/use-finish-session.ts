import {
  applySessionWorkout,
  editFinishedSession,
  logPastSession,
  type FinishInput,
  type SessionDetail,
} from "@workspace/sync";
import { SET_KIND_KEYS } from "@workspace/shared";
import { Share } from "react-native";
import { useTrainingWrite } from "@/training";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { sessionAsText } from "./session-as-text";

export function useFinishSession() {
  const { write, writeScope } = useTrainingWrite();
  const { t, i18n } = useTranslation();
  const { preferences } = usePreferences();
  return {
    edit: (id: string, input: FinishInput) =>
      write((db) => editFinishedSession(db, id, input, writeScope), false),
    applyWorkout: (id: string, options: Parameters<typeof applySessionWorkout>[2]) =>
      write((db) => applySessionWorkout(db, id, options, writeScope), null),
    logPast: (workoutId: string | null, startedAt: string) =>
      write(
        (db) =>
          logPastSession(
            db,
            { workoutId, derivedTitle: t("session__past_title") },
            { startedAt },
            writeScope,
          ),
        null,
      ),
    share: (session: SessionDetail, stats: string) =>
      write(async () => {
        await Share.share({
          message: sessionAsText(session, {
            date: new Intl.DateTimeFormat(i18n.language, {
              timeZone: preferences.timezone ?? undefined,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(session.startedAt)),
            stats,
            unit: preferences.ui.weightUnit,
            unitLabel: t(
              preferences.ui.weightUnit === "kg" ? "training__unit_kg" : "training__unit_lb",
            ),
            kind: (kind) => t(SET_KIND_KEYS[kind]),
            effort: (value) => t("session__share_effort", { value }),
          }),
        });
        return true;
      }, false),
  };
}
