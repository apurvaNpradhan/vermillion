import { AvatarPicker } from "@/account";
import { HidePhotosRow, WeightPreferenceRow } from "@/body";
import { isNetworkError } from "@workspace/client/network-error";
import { useRouter } from "expo-router";
import {
  Barbell,
  Bell,
  ChatCircleText,
  Database,
  Hash,
  Info,
  ListChecks,
  LinkSimple,
  SignOut,
  Trash,
} from "phosphor-react-native";
import { useState } from "react";
import { Linking, View } from "react-native";

import { useSession, useSignOut } from "@/auth";
import { crashReportingConfigured } from "@/platform/crash-reporting";
import { useIsOnline } from "@/platform/network";
import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { FormError } from "@/platform/ui/form-error";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { PreferenceRows } from "@/preferences";
import { useTrainingPreferenceRows } from "@/training";
import { SyncBanner, useSignOutConfirmation } from "@/sync";

import { CrashReportsRow } from "./crash-reports-row";
import { FeedbackSheet } from "./feedback-sheet";

/**
 * Settings as grouped rows: the profile picture, Preferences (appearance, language, time zone,
 * units), Workouts (a pushed page of its own), Body, Notifications (a pushed page of its own), Help, Data and Account. Rows that open picker
 * sheets show their current value.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSignOut();
  const online = useIsOnline();
  const { requestSignOut, confirmationProps } = useSignOutConfirmation(() => signOut.mutate());
  const training = useTrainingPreferenceRows();
  const { session } = useSession();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <ConfirmationDialog {...confirmationProps} />
      {training.sheets}
      <FeedbackSheet
        isOpen={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        email={session?.user.email ?? null}
      />
      <ScrollPage title={t("settings__title")}>
        <AvatarPicker />
        <View>
          <SyncBanner />
        </View>
        <PreferenceRows>{training.rows.unit}</PreferenceRows>
        <ListSection title={t("settings__workouts_title")}>
          <ListRow
            icon={Barbell}
            title={t("settings__workouts_screen")}
            description={t("settings__workouts_hint")}
            onPress={() => router.push("/settings/workouts")}
          />
        </ListSection>
        <ListSection title={t("settings__section_body")}>
          <WeightPreferenceRow />
          <HidePhotosRow />
          <ListRow
            icon={ListChecks}
            title={t("body__tracked_metrics")}
            onPress={() => router.push("/settings/tracked-metrics")}
          />
        </ListSection>
        <ListSection title={t("settings__section_notifications")}>
          <ListRow
            icon={Bell}
            title={t("settings__notifications_screen")}
            description={t("settings__notifications_hint")}
            onPress={() => router.push("/settings/notifications")}
          />
        </ListSection>
        <ListSection title={t("settings__section_help")}>
          <ListRow
            icon={ChatCircleText}
            title={t("settings__feedback")}
            accessory="none"
            onPress={() => {
              // Without a Sentry project the form has nowhere to go: write an email instead.
              if (crashReportingConfigured) setFeedbackOpen(true);
              else
                void Linking.openURL(
                  `mailto:${appConfig.supportEmail}?subject=${encodeURIComponent(
                    t("settings__feedback_subject", { name: appConfig.displayName }),
                  )}`,
                );
            }}
          />
          <CrashReportsRow />
          <ListRow
            icon={Info}
            title={t("settings__about")}
            accessory="none"
            value={t("settings__version", {
              name: appConfig.displayName,
              version: appConfig.version,
            })}
          />
        </ListSection>
        <ListSection title={t("settings__section_sharing")}>
          <ListRow
            icon={Hash}
            title={t("share__enter_code_title")}
            description={t("settings__enter_code_hint")}
            onPress={() => router.push("/import")}
          />
          <ListRow
            icon={LinkSimple}
            title={t("share__links_title")}
            description={t("settings__shared_links_hint")}
            onPress={() => router.push("/settings/shared-links")}
          />
        </ListSection>
        <ListSection title={t("settings__section_data")}>
          <ListRow
            icon={Database}
            title={t("settings__data_title")}
            description={t("settings__data_hint")}
            onPress={() => router.push("/settings/data")}
          />
        </ListSection>
        {isNetworkError(signOut.error) ? <FormError message={t("errors__offline")} /> : null}
        <ListSection title={t("settings__section_account")}>
          <ListRow
            icon={SignOut}
            title={t("nav__sign_out")}
            accessory="none"
            description={online ? undefined : t("common__needs_connection")}
            disabled={signOut.isPending || !online}
            onPress={() => void requestSignOut()}
          />
          <ListRow
            icon={Trash}
            title={t("settings__delete_title")}
            tone="danger"
            description={online ? undefined : t("common__needs_connection")}
            disabled={!online}
            onPress={() => router.push("/settings/delete-account")}
          />
        </ListSection>
      </ScrollPage>
    </>
  );
}
