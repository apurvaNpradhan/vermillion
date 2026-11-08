import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { CaretLeft } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { FloatingSurface } from "@/platform/ui/floating-surface";

/**
 * The frame of every auth screen: a back button to where the user came from (the welcome
 * screen), a large left-aligned title with one line under it, then the form. The form scrolls
 * clear of the keyboard; the footer link sits at the bottom.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow px-5"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View className="h-11 justify-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("nav__back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          className="self-start"
        >
          <FloatingSurface radius={22} className="h-11 w-11 items-center justify-center">
            <CaretLeft size={20} color={foreground} weight="bold" />
          </FloatingSurface>
        </Pressable>
      </View>
      <View className="mx-auto w-full max-w-md flex-1 gap-8 pt-6">
        <View className="gap-2">
          <Text accessibilityRole="header" className="font-semibold text-title-xl text-foreground">
            {title}
          </Text>
          {description ? <Text className="text-body-lg text-muted">{description}</Text> : null}
        </View>
        <View className="gap-4">{children}</View>
        {footer ? <View className="mt-auto items-center gap-2 pt-6">{footer}</View> : null}
      </View>
    </KeyboardAwareScrollView>
  );
}
