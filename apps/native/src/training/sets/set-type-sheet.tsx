import { FixedSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { SET_KINDS, SET_KIND_KEYS, type SetKind } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { Check } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SHEET_SPRING, useSheetAnimation } from "@/platform/ui/sheet-motion";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { SET_TONES } from "./set-tones";

const HINTS = {
  working: "training__set_type_working_hint",
  warmup: "training__set_type_warmup_hint",
  drop: "training__set_type_drop_hint",
  failure: "training__set_type_failure_hint",
  top: "training__set_type_top_hint",
  backoff: "training__set_type_backoff_hint",
  myo: "training__set_type_myo_hint",
} as const;
/** Roughly the sheet's closing animation. */
const CLOSE_MS = 200;
const BADGES = {
  working: "1",
  warmup: "training__chip_warmup",
  drop: "training__chip_drop",
  failure: "training__chip_failure",
  top: "training__chip_top",
  backoff: "training__chip_backoff",
  myo: "training__chip_myo",
} as const;

function SetTypeSheetBody({
  isOpen,
  onOpenChange,
  value,
  onSelect,
  warmupsAllowed,
  title,
  workingAllowed = true,
  extras,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: SetKind;
  onSelect: (kind: SetKind) => void;
  warmupsAllowed: boolean;
  /** Overrides the "Set type" title, e.g. when the sheet adds a set. */
  title?: string;
  workingAllowed?: boolean;
  /** Actions for the set under the kinds (Fill remaining, Remove…); each closes the sheet first. */
  extras?: readonly SwipeAction[];
}) {
  const animation = useSheetAnimation();
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const subtle = useSubtleColor();
  return (
    <BottomSheet animation={animation} isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <FixedSheetContent
          fraction={0.8}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 pt-2"
        >
          <BottomSheet.Title className="px-4 font-semibold text-title-lg">
            {title ?? t("training__set_kind_title")}
          </BottomSheet.Title>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom + 16, gap: 4 }}
          >
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
                        <Text className="font-normal text-caption text-muted">
                          {t(HINTS[kind])}
                        </Text>
                      </View>
                      {value === kind ? <Check size={20} color={subtle} /> : null}
                    </Pressable>,
                  ],
            )}
            {extras?.length ? (
              <ListSection>
                {extras.map((action) => (
                  <ListRow
                    key={action.key}
                    icon={action.icon}
                    title={action.label}
                    tone={action.tone}
                    accessory="none"
                    onPress={() => {
                      onOpenChange(false);
                      // After the sheet is gone, so an action that opens another sheet does not
                      // animate in while this one is still leaving.
                      if (animation) {
                        requestAnimationFrame(() => requestAnimationFrame(action.onPress));
                      } else {
                        setTimeout(action.onPress, CLOSE_MS);
                      }
                    }}
                  />
                ))}
              </ListSection>
            ) : null}
          </BottomSheetScrollView>
        </FixedSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export const SetTypeSheet = mountOnOpen(SetTypeSheetBody);
