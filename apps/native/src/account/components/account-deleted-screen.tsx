import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useDeletedAccountCleanup } from "../use-deleted-account-cleanup";
import { useTranslation } from "@/platform/i18n";
import { Screen } from "@/platform/ui/screen";
import { Button } from "@/platform/ui/button";

/**
 * Where the deletion link in the email lands (deep link). The server already
 * removed the account, so this only drops the local session and cache.
 */
export function AccountDeletedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  useDeletedAccountCleanup();

  return (
    <Screen withTopInset>
      <View className="mx-auto w-full max-w-sm flex-1 justify-center gap-6 py-6">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-semibold text-title-xl text-foreground">
            {t("settings__delete_done_title")}
          </Text>
          <Text className="text-muted">{t("settings__delete_done_body")}</Text>
        </View>
        <Button onPress={() => router.replace("/")}>
          <Button.Label>{t("nav__home")}</Button.Label>
        </Button>
      </View>
    </Screen>
  );
}
