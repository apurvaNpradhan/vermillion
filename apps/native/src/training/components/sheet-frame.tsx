import { useThemeColor } from "heroui-native";
import { X } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";

/** The page of a modal sheet route: a close button, a centred title and keyboard-aware content. */
export function SheetFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={24}
      >
        <View className="h-11 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common__close")}
            onPress={onClose}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-default"
          >
            <X size={18} color={foreground} weight="bold" />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 px-3 text-center font-semibold text-title-md text-foreground"
          >
            {title}
          </Text>
          <View className="h-11 w-11" />
        </View>
        {children}
      </KeyboardAwareScrollView>
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 bg-background"
        style={{ height: insets.top }}
      />
    </View>
  );
}
