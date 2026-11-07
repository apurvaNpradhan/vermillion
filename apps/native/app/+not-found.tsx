import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("errors__page_not_found") }} />
      <View className="flex-1 items-center justify-center gap-4 bg-background p-4">
        <Text className="font-semibold text-foreground text-lg">{t("errors__page_not_found")}</Text>
        <Link href="/" asChild>
          <Text className="text-foreground underline">{t("nav__home")}</Text>
        </Link>
      </View>
    </>
  );
}
