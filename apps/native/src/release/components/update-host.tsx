import { DownloadSimple, X } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Screen } from "@/platform/ui/screen";

import { DOWNLOAD_URL, useUpdateCheck } from "../use-update-check";

const openDownload = () => void Linking.openURL(DOWNLOAD_URL);

/** Below the Minimum supported version: nothing else is shown until the app is updated. */
function UpdateRequiredScreen({ minimumVersion }: { minimumVersion: string }) {
  const { t } = useTranslation();
  return (
    <Screen withTopInset>
      <View className="mx-auto w-full max-w-sm flex-1 justify-center gap-6 py-6">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-semibold text-title-xl text-foreground">
            {t("release__required_title")}
          </Text>
          <Text className="font-normal text-muted">
            {t("release__required_body", { version: minimumVersion })}
          </Text>
        </View>
        <Button onPress={openDownload}>
          <Button.Label>{t("release__download")}</Button.Label>
        </Button>
      </View>
    </Screen>
  );
}

/** A newer build exists: a quiet card above the tab bar, dismissed once per version. */
function UpdateAvailableNotice({ version, onDismiss }: { version: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const muted = useThemeColor("muted");
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-4"
      style={{ bottom: insets.bottom + 88 }}
    >
      <View className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
        <Pressable
          accessibilityRole="link"
          onPress={openDownload}
          className="flex-1 flex-row items-center gap-3"
        >
          <DownloadSimple size={20} color={muted} />
          <View className="flex-1">
            <Text className="text-body font-semibold text-foreground">
              {t("release__available_title", { version })}
            </Text>
            <Text className="font-normal text-caption text-muted">
              {t("release__available_body")}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("release__dismiss")}
          hitSlop={12}
          onPress={onDismiss}
        >
          <X size={20} color={muted} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Wraps the app: a blocking screen below the Minimum supported version, a dismissible notice
 * below the latest release, otherwise the app as it is.
 */
export function UpdateHost({ children }: { children: ReactNode }) {
  const { view, dismiss } = useUpdateCheck();
  if (view.kind === "required")
    return <UpdateRequiredScreen minimumVersion={view.minimumVersion} />;
  return (
    <>
      {children}
      {view.kind === "available" ? (
        <UpdateAvailableNotice version={view.version} onDismiss={dismiss} />
      ) : null}
    </>
  );
}
