import { useBodyReminderRows } from "@/body";
import { useReminderRows, useRestAlertRows } from "@/session";
import { useTranslation } from "@/platform/i18n";
import { ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";

/**
 * Every reminder in one place, grouped by meaning: Training (the training reminder and the Rest
 * alerts), Body (weigh-in and Check-in) and Records (the report). All are off until turned on,
 * except the Rest alerts, which keep how they have always behaved.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const reminders = useReminderRows();
  const rest = useRestAlertRows();
  const body = useBodyReminderRows();
  return (
    <>
      {body.editor}
      {rest.picker}
      <ScrollPage title={t("settings__notifications_screen")} back backFallback="/settings">
        {reminders.permissionRow ? <ListSection>{reminders.permissionRow}</ListSection> : null}
        <ListSection title={t("reminder__group_training")}>
          {reminders.training}
          {rest.rows}
        </ListSection>
        <ListSection title={t("reminder__group_body")}>{body.rows}</ListSection>
        <ListSection title={t("reminder__group_records")}>{reminders.records}</ListSection>
      </ScrollPage>
    </>
  );
}
