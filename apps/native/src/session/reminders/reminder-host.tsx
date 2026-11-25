import { watchSessionStarts, type TrainingDatabase } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { deviceTimeZone, useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
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
  REPORT_REMINDER_PREFIX,
  TRAINING_REMINDER_PREFIX,
  startedTrainingReminderId,
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
 * with the app closed. The OS holds absolute times, so a zone change or a Session on another
 * device may leave an old request pending until the app runs and reconciles again.
 */
export function ReminderHost() {
  const { t, i18n } = useTranslation();
  const { preferences, hasPreferences } = usePreferences();
  const permission = useNotificationPermission();
  const program = useActiveProgram();
  const calendarZone = useDeviceTimeZone();
  const [observedZone, setObservedZone] = useState(deviceTimeZone);
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    const checkZone = () => setObservedZone(deviceTimeZone());
    checkZone();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      checkZone();
      setOpenedAt((count) => count + 1);
    });
    // Android's Expo calendar signal is tied to configuration changes, which can miss zone changes.
    const poll =
      Platform.OS === "android"
        ? setInterval(() => {
            if (AppState.currentState === "active") checkZone();
          }, 30_000)
        : null;
    return () => {
      subscription.remove();
      if (poll !== null) clearInterval(poll);
    };
  }, [calendarZone]);

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
  const sessions = starts.value;
  const granted = permission === "granted";
  const cancelTraining =
    (permission !== "unknown" && !granted) || (hasPreferences && !trainingReminder.enabled);
  const cancelReports =
    (permission !== "unknown" && !granted) || (hasPreferences && !reportReminder.enabled);
  const ready = hasPreferences && granted && sessions !== undefined && program.ready;

  useEffect(() => {
    const now = new Date();
    const timeZone = observedZone;
    void reconciler()
      .enqueue(async (current) => {
        // Cancel even if the Session watch or the active program isn't ready to build a plan.
        if (!cancelTraining && sessions) {
          const id = startedTrainingReminderId(sessions, now, timeZone);
          if (id !== null) await cancelReminder(id);
        }
        if (cancelTraining || cancelReports) {
          for (const { id } of await heldReminders()) {
            if (!current()) return;
            if (
              (cancelTraining && id.startsWith(TRAINING_REMINDER_PREFIX)) ||
              (cancelReports && id.startsWith(REPORT_REMINDER_PREFIX))
            )
              await cancelReminder(id);
          }
        }
        if (
          !current() ||
          !ready ||
          !sessions ||
          (!trainingReminder.enabled && !reportReminder.enabled)
        )
          return;

        const entries: ReminderEntry[] = [
          ...desiredTrainingReminders({
            now,
            timeZone,
            reminder: trainingReminder,
            sessionsPerWeek,
            sessions,
            granted: true,
          }),
          ...desiredReportReminders({
            now,
            timeZone,
            reminder: reportReminder,
            time: trainingReminder.time,
            sessions,
            granted: true,
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
        await installReminderChannel(channel);
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
    sessions,
    cancelTraining,
    cancelReports,
    trainingReminder,
    reportReminder,
    sessionsPerWeek,
    trainingBody,
    trainingTitle,
    reportTitle,
    channel,
    language,
    observedZone,
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
