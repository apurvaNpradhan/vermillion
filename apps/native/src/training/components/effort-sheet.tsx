import type { EffortScale } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import type { EffortRange } from "../effort";
import { EffortSelector } from "./effort-selector";

/**
 * A small sheet with the effort control for one set. Changes apply at once; Done closes it. The
 * control is plain presses, so it works on a sheet that sits over a modal route.
 */
export function EffortSheet({
  isOpen,
  onOpenChange,
  title,
  value,
  scale,
  onChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: EffortRange | null;
  scale: EffortScale;
  onChange: (value: EffortRange | null) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="gap-1 px-1">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            <BottomSheet.Description className="text-body text-muted">
              {t("training__effort_hint")}
            </BottomSheet.Description>
          </View>
          <EffortSelector value={value} scale={scale} onChange={onChange} />
          <Text className="px-1 text-caption text-muted">
            {t(scale === "rpe" ? "training__effort_rpe_name" : "training__effort_rir_name")}
          </Text>
          <Button variant="primary" onPress={() => onOpenChange(false)}>
            <Button.Label>{t("training__effort_done")}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
