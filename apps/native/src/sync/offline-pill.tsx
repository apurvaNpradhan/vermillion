import { BottomSheet, useThemeColor } from "heroui-native";
import { CloudSlash } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useOfflineIndicator } from "./use-offline-indicator";

const FADE_MS = 200;
const fadeIn = FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.System);
const fadeOut = FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.System);

/**
 * A small muted "Offline" pill for the top bar. It fades in after a short grace period of being
 * disconnected and out on reconnect; tapping it says that changes are saved on this device and
 * sync when back online. Renders nothing while connected.
 */
export function OfflinePill() {
  const { t } = useTranslation();
  const offline = useOfflineIndicator();
  const [open, setOpen] = useState(false);
  const { bottom } = useSafeAreaInsets();
  const muted = useThemeColor("muted");

  if (!offline) return null;
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("offline__pill")}
        accessibilityHint={t("offline__body")}
        hitSlop={8}
        onPress={() => setOpen(true)}
        className="h-7 flex-row items-center gap-1 rounded-full bg-default px-2.5"
      >
        <CloudSlash size={14} color={muted} weight="bold" />
        <Text className="font-semibold text-label text-muted">{t("offline__pill")}</Text>
      </Pressable>
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            animationConfigs={SHEET_SPRING}
            backgroundClassName="rounded-t-[28px] bg-overlay"
            contentContainerClassName="gap-2 px-5 pt-2"
            contentContainerProps={{ style: { paddingBottom: bottom + 24 } }}
          >
            <View className="gap-2">
              <BottomSheet.Title className="font-semibold text-title-lg">
                {t("offline__title")}
              </BottomSheet.Title>
              <Text className="text-body text-muted">{t("offline__body")}</Text>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </Animated.View>
  );
}
