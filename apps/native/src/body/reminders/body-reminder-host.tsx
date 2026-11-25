import { useEffect } from "react";
import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";
import { useNotificationPermission } from "@/platform/notifications/permission-store";
import { createNotificationReconciler } from "@/platform/notifications/reconciler";
import { desiredBodyReminders, planBodyReminders } from "./reminder-schedule";
import {
  cancelBodyReminder,
  installBodyChannel,
  scheduleBodyReminder,
  scheduledBodyReminders,
} from "./reminder-notifications";

// Shared across mounts: sign-out cancellation must finish before a new account schedules.
// Created on first use, so loading this module has no side effect.
let shared: ReturnType<typeof createNotificationReconciler> | undefined;
const reconciler = () => (shared ??= createNotificationReconciler());
export function BodyReminderHost() {
  const { preferences, hasPreferences } = usePreferences();
  const { t } = useTranslation();
  const permission = useNotificationPermission();
  const title = t("body__reminder_channel");
  const weightTitle = t("body__reminder_weight_title");
  const weightBody = t("body__reminder_weight_body");
  const checkTitle = t("body__reminder_check_title");
  const checkBody = t("body__reminder_check_body");
  const ui = preferences.ui;
  useEffect(() => {
    if (permission === "unknown" || (permission === "granted" && !hasPreferences)) return;
    void reconciler()
      .enqueue(async (current) => {
        const scheduled = await scheduledBodyReminders();
        if (!current()) return;
        const desired = desiredBodyReminders({ ui, granted: permission === "granted" });
        const plan = planBodyReminders(
          desired,
          scheduled,
          JSON.stringify([weightTitle, weightBody, checkTitle, checkBody]),
        );
        for (const id of plan.cancel) {
          await cancelBodyReminder(id);
          if (!current()) return;
        }
        if (desired.length === 0) return;
        await installBodyChannel(title);
        if (!current()) return;
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
    return () => reconciler().invalidate();
  }, [ui, hasPreferences, permission, title, weightTitle, weightBody, checkTitle, checkBody]);
  useEffect(
    () => () => {
      void reconciler()
        .enqueue(async () => {
          for (const entry of await scheduledBodyReminders()) await cancelBodyReminder(entry.id);
        })
        .catch(() => undefined);
    },
    [],
  );
  return null;
}
