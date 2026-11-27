import {
  applySessionWorkout,
  editFinishedSession,
  logPastSession,
  type FinishInput,
} from "@workspace/sync";
import { useTrainingWrite } from "@/training";
import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";

export function useFinishSession() {
  const { write, writeScope } = useTrainingWrite();
  const { t } = useTranslation();
  const timeZone = useDeviceTimeZone();
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
            { workoutId, derivedTitle: t("session__past_title"), timeZone },
            { startedAt },
            writeScope,
          ),
        null,
      ),
  };
}
