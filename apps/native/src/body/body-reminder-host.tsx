import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { createRestReconciler, getRestPermission } from "@/session";
import { useWeight } from "./use-weight";
import { desiredBodyReminders, planBodyReminders } from "./reminder-schedule";
import {
  cancelBodyReminder,
  installBodyChannel,
  scheduleBodyReminder,
  scheduledBodyReminders,
} from "./reminder-notifications";

// Shared across mounts: sign-out cancellation must finish before a new account schedules.
const reconciler = createRestReconciler();
export function BodyReminderHost() {
  const { preferences, hasPreferences } = usePreferences();
  const weight = useWeight();
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    // Also refresh across midnight and the reminder time while the app stays open.
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  const loggedToday = weight.entries.some(
    (entry) => entry.local_date === weight.localDate(new Date(now).toISOString()),
  );
  const title = t("body__reminder_channel");
  const weightTitle = t("body__reminder_weight_title");
  const weightBody = t("body__reminder_weight_body");
  const checkTitle = t("body__reminder_check_title");
  const checkBody = t("body__reminder_check_body");
  const ui = preferences.ui;
  useEffect(() => {
    if (!hasPreferences || weight.loading) return;
    void reconciler
      .enqueue(async (current) => {
        await installBodyChannel(title);
        if (!current()) return;
        const granted = await getRestPermission();
        if (!current()) return;
        const scheduled = await scheduledBodyReminders();
        if (!current()) return;
        const desired = desiredBodyReminders({
          ui,
          now,
          loggedToday,
          granted: granted === "granted",
        });
        const plan = planBodyReminders(
          desired,
          scheduled,
          JSON.stringify([
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            new Date(now).getTimezoneOffset(),
            weightTitle,
            weightBody,
            checkTitle,
            checkBody,
          ]),
        );
        for (const id of plan.cancel) {
          await cancelBodyReminder(id);
          if (!current()) return;
        }
        for (const entry of plan.schedule) {
          await scheduleBodyReminder(
            entry,
            entry.kind === "weight"
              ? { title: weightTitle, body: weightBody }
              : { title: checkTitle, body: checkBody },
          );
          if (!current()) return;
        }
      })
      .catch(() => undefined);
    return () => reconciler.invalidate();
  }, [
    ui,
    now,
    loggedToday,
    hasPreferences,
    weight.loading,
    title,
    weightTitle,
    weightBody,
    checkTitle,
    checkBody,
  ]);
  useEffect(
    () => () => {
      void reconciler
        .enqueue(async () => {
          for (const entry of await scheduledBodyReminders()) await cancelBodyReminder(entry.id);
        })
        .catch(() => undefined);
    },
    [],
  );
  return null;
}
