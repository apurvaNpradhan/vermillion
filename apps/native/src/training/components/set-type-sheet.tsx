import { SET_KINDS, SET_KIND_KEYS, type SetKind } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { Check } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { SET_TONES } from "../set-tones";

const HINTS = {
  working: "training__set_type_working_hint",
  warmup: "training__set_type_warmup_hint",
  drop: "training__set_type_drop_hint",
  failure: "training__set_type_failure_hint",
} as const;
const BADGES = {
  working: "1",
  warmup: "training__chip_warmup",
  drop: "training__chip_drop",
  failure: "training__chip_failure",
} as const;

export function SetTypeSheet({
  isOpen,
  onOpenChange,
  value,
  onSelect,
  warmupsAllowed,
  title,
  workingAllowed = true,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: SetKind;
  onSelect: (kind: SetKind) => void;
  warmupsAllowed: boolean;
  /** Overrides the "Set type" title, e.g. when the sheet adds a set. */
  title?: string;
  workingAllowed?: boolean;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const subtle = useSubtleColor();
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
          <BottomSheet.Title className="font-semibold text-title-lg">
            {title ?? t("training__set_kind_title")}
          </BottomSheet.Title>
          <View className="gap-1">
            {SET_KINDS.flatMap((kind) =>
              (kind === "warmup" && !warmupsAllowed) || (kind === "working" && !workingAllowed)
                ? []
                : [
                    <Pressable
                      key={kind}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: value === kind }}
                      accessibilityLabel={t(SET_KIND_KEYS[kind])}
                      onPress={() => {
                        onSelect(kind);
                        onOpenChange(false);
                      }}
                      className="min-h-16 flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-default"
                    >
                      <View
                        className={`h-11 w-11 items-center justify-center rounded-lg ${SET_TONES[kind].background}`}
                      >
                        <Text className={`font-semibold text-label ${SET_TONES[kind].text}`}>
                          {kind === "working" ? BADGES.working : t(BADGES[kind])}
                        </Text>
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="font-medium text-body text-foreground">
                          {t(SET_KIND_KEYS[kind])}
                        </Text>
                        <Text className="text-caption text-muted">{t(HINTS[kind])}</Text>
                      </View>
                      {value === kind ? <Check size={18} color={subtle} /> : null}
                    </Pressable>,
                  ],
            )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
