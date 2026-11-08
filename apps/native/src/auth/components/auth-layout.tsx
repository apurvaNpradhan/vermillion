import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { CaretLeft } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { FloatingSurface } from "@/platform/ui/floating-surface";

/** Room the pinned action and footer take, so the form scrolls clear of them. */
const ACTION_AREA = 120;

/**
 * The frame of every auth screen: a back button to where the user came from (the welcome
 * screen), a large title with one line under it, then the form. The screen's one primary action
 * and its footer link are pinned to the bottom and ride above the keyboard, in thumb reach.
 */
export function AuthLayout({
  title,
  description,
  children,
  action,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  /** The primary button, pinned above the keyboard. */
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const pinned = action !== undefined || footer !== undefined;

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow px-5"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: (pinned ? ACTION_AREA : 0) + insets.bottom + 16,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={pinned ? ACTION_AREA : 24}
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
        <View className="mx-auto w-full max-w-md gap-8 pt-8">
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="font-semibold text-[34px] leading-[40px] tracking-tight text-foreground"
            >
              {title}
            </Text>
            {description ? <Text className="text-body-lg text-muted">{description}</Text> : null}
          </View>
          <View className="gap-5">{children}</View>
        </View>
      </KeyboardAwareScrollView>
      {pinned ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View className="bg-background px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
            <View className="mx-auto w-full max-w-md gap-3">
              {action}
              {footer ? <View className="items-center">{footer}</View> : null}
            </View>
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

/** The divider between social sign-in and the email form. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3" accessible accessibilityLabel={label}>
      <View className="h-px flex-1 bg-border" />
      <Text className="text-caption text-muted">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
