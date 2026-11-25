import { watchSessionStarts, type TrainingDatabase } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useNotificationPermission } from "@/platform/notifications/permission-store";
import { createNotificationReconciler } from "@/platform/notifications/reconciler";
import { usePreferences } from "@/preferences";
import { useActiveProgram } from "@/training";

import {
  desiredReportReminders,
  desiredTrainingReminders,
  planReminders,
  reminderHistoryStart,
  reminderSignature,
  type ReminderEntry,
} from "./reminder-plan";
import {
  cancelReminder,
  heldReminders,
  installReminderChannel,
  scheduleReminder,
} from "./reminder-notifications";

// Created on first use, so loading this module has no side effect.
let shared: ReturnType<typeof createNotificationReconciler> | undefined;
const reconciler = () => (shared ??= createNotificationReconciler());

/**
 * Keeps the training and report notifications in step with the preferences, the Sessions and the
 * active Run: when the app opens or returns to the front, and whenever a Session starts or
 * finishes or the Run's next workout changes. They are dated local notifications, so they arrive
 * with the app closed; the next schedule replaces them. Mount once, in the signed-in app.
 */
export function ReminderHost() {
  const { t, i18n } = useTranslation();
  const { preferences, hasPreferences } = usePreferences();
  const permission = useNotificationPermission();
  const program = useActiveProgram();
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setOpenedAt((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  const from = useMemo(() => reminderHistoryStart(new Date()).toISOString(), []);
  const starts = useLocalWatch(
    useCallback(
      (
        database: TrainingDatabase,
        onValue: Parameters<typeof watchSessionStarts>[2],
        onError: () => void,
      ) => watchSessionStarts(database, from, onValue, onError),
      [from],
    ),
  );

  const { trainingReminder, reportReminder, sessionsPerWeek } = preferences.ui;
  const nextWorkout =
    program.program?.slots.find((slot) => slot.id === program.progress.next?.id)?.workout?.title ??
    null;
  const language = i18n.language;
  const channel = t("reminder__channel");
  const trainingTitle = t("reminder__training_title");
  const trainingBody =
    nextWorkout === null
      ? t("reminder__training_none")
      : t("reminder__training_next", { workout: nextWorkout });
  const reportTitle = t("reminder__report_title");
  const wanted = trainingReminder.enabled || reportReminder.enabled;
  const ready =
    hasPreferences && permission !== "unknown" && starts.value !== undefined && program.ready;

  useEffect(() => {
    if (!ready) return;
    const sessions = starts.value ?? [];
    const granted = permission === "granted";
    const now = new Date();
    const entries: ReminderEntry[] = [
      ...desiredTrainingReminders({
        now,
        reminder: trainingReminder,
        sessionsPerWeek,
        sessions,
        granted,
      }),
      ...desiredReportReminders({
        now,
        reminder: reportReminder,
        time: trainingReminder.time,
        sessions,
        granted,
      }),
    ];
    const content = (entry: ReminderEntry) => {
      if (entry.kind === "training") return { title: trainingTitle, body: trainingBody };
      const body =
        entry.period.kind === "year"
          ? t("reminder__report_year", { year: entry.period.year })
          : t("reminder__report_month", {
              month: new Intl.DateTimeFormat(language, { month: "long" }).format(
                new Date(entry.period.year, entry.period.month - 1, 1),
              ),
            });
      return { title: reportTitle, body };
    };
    const desired = entries.map((entry) => ({
      ...entry,
      signature: reminderSignature(entry, content(entry)),
    }));
    void reconciler()
      .enqueue(async (current) => {
        if (wanted) await installReminderChannel(channel);
        if (!current()) return;
        const plan = planReminders(desired, await heldReminders());
        if (!current()) return;
        for (const id of plan.cancel) {
          await cancelReminder(id);
          if (!current()) return;
        }
        for (const entry of plan.schedule) {
          await scheduleReminder(entry, content(entry));
          if (!current()) return;
        }
      })
      .catch(() => undefined);
    return () => reconciler().invalidate();
    // `t` only changes with the language, which `trainingBody` and `reportTitle` already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    starts.value,
    permission,
    trainingReminder,
    reportReminder,
    sessionsPerWeek,
    trainingBody,
    trainingTitle,
    reportTitle,
    channel,
    language,
    wanted,
    openedAt,
  ]);

  useEffect(
    () => () => {
      // Signing out leaves nothing of this account scheduled.
      void reconciler()
        .enqueue(async () => {
          for (const entry of await heldReminders()) await cancelReminder(entry.id);
        })
        .catch(() => undefined);
    },
    [],
  );
  return null;
}
