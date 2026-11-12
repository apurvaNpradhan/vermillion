import { BottomSheet } from "heroui-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { workoutLive } from "../../../modules/workout-live";
import { AppState, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { ListSection, ListRow } from "@/platform/ui/list";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { useTrainingPreferenceRows } from "@/training";

import { useSessionSettings } from "../use-session-settings";

/**
 * The settings a workout needs at hand, opened from the Session's menu: the same rows as
 * Settings (sounds, unit, effort scale, default rest, Rest notifications, keep awake, equipment),
 * editing the same account preferences.
 */
export function SessionSettingsSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const settings = useSessionSettings();
  const [promotion, setPromotion] = useState(() => workoutLive?.promotionStatus() ?? "unsupported");
  useEffect(() => {
    const refresh = () => setPromotion(workoutLive?.promotionStatus() ?? "unsupported");
    refresh();
    const subscription = AppState.addEventListener("change", refresh);
    return () => subscription.remove();
  }, [isOpen]);
  // Read here, outside the sheet's portal: the portal has no query client.
  const training = useTrainingPreferenceRows({
    extraRows: settings.rows,
    onManageEquipment: () => {
      onOpenChange(false);
      router.push("/session/equipment");
    },
  });
  return (
    <>
      <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            snapPoints={["88%"]}
            enableDynamicSizing={false}
            enableOverDrag={false}
            animationConfigs={SHEET_SPRING}
            backgroundClassName="rounded-t-[28px] bg-overlay"
            contentContainerClassName="h-full"
          >
            <View className="px-5 pb-3 pt-2">
              <BottomSheet.Title className="font-semibold text-title-lg">
                {t("session__settings_title")}
              </BottomSheet.Title>
            </View>
            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingBottom: bottom + 16 }}
            >
              <ListSection title={t("session__setting_sounds")}>{settings.soundRows}</ListSection>
              {Platform.OS === "android" && (
                <ListSection>
                  <ListRow
                    title={t("session__live_setting")}
                    value={t(
                      promotion === "unsupported"
                        ? "session__live_unsupported"
                        : promotion === "granted"
                          ? "session__setting_on"
                          : "session__setting_off",
                    )}
                    onPress={() => workoutLive?.openPromotionSettings()}
                  />
                </ListSection>
              )}
              {training.section}
              <Text className="px-1 text-caption text-muted">
                {t("session__settings_footnote")}
              </Text>
            </BottomSheetScrollView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      {settings.sheets}
      {training.sheets}
    </>
  );
}
