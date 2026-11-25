import {
  EQUIPMENT_KEYS,
  MUSCLE_DETAIL_KEYS,
  MUSCLE_GROUP_KEYS,
  type Equipment,
} from "@workspace/shared";
import type { LibraryRow } from "@workspace/sync";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { ExerciseThumbnail } from "../../library/components/exercise-thumbnail";

const CARD_WIDTH = 132;

/**
 * "Swap for": a horizontal row of cards, one per exercise that works the same muscle. The gym's
 * own equipment comes first; a card for equipment it lacks stays pickable but is muted and says
 * "Not here". Renders nothing without candidates.
 */
export function SwapRow({
  candidates,
  hasEquipment = () => true,
  onOpen,
  selectedIds,
  bleed = false,
}: {
  candidates: readonly LibraryRow[];
  /** Whether the gym has an exercise's equipment; the default is that it has everything. */
  hasEquipment?: (equipment: Equipment) => boolean;
  onOpen: (id: string) => void;
  /** Pick mode: the cards are checkboxes and these are ticked, instead of buttons that open. */
  selectedIds?: readonly string[];
  /** The row sits in padded content: pull the scroller out to the screen edges. */
  bleed?: boolean;
}) {
  const { t } = useTranslation();
  if (candidates.length === 0) return null;
  return (
    <View className={bleed ? "-mx-4 gap-3" : "gap-3"}>
      <View className="gap-0.5 px-4">
        <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
          {t("exercise__swap_title")}
        </Text>
        <Text className="font-normal text-caption text-muted">{t("exercise__swap_hint")}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4"
      >
        {candidates.map((candidate) => {
          const picking = selectedIds !== undefined;
          const selected = selectedIds?.includes(candidate.id) ?? false;
          const here = hasEquipment(candidate.equipment);
          const label = picking
            ? here
              ? "exercise__swap_pick"
              : "exercise__swap_pick_unavailable"
            : here
              ? "exercise__swap_open"
              : "exercise__swap_open_unavailable";
          return (
            <Pressable
              key={candidate.id}
              accessibilityRole={picking ? "checkbox" : "button"}
              accessibilityState={picking ? { checked: selected } : undefined}
              accessibilityLabel={t(label, { title: candidate.title })}
              onPress={() => onOpen(candidate.id)}
              className={`gap-2 rounded-xl border active:opacity-70 p-2 active:bg-default ${
                selected ? "border-foreground bg-default" : "border-transparent bg-surface"
              } ${here ? "" : "opacity-60"}`}
              style={{ width: CARD_WIDTH }}
            >
              <ExerciseThumbnail
                imageMediaId={candidate.imageMediaId}
                thumbnailKey={candidate.thumbnailKey}
                title={candidate.title}
                size={CARD_WIDTH - 18}
              />
              <Text numberOfLines={2} className="min-h-10 text-caption font-medium text-foreground">
                {candidate.title}
              </Text>
              <Text numberOfLines={1} className="font-normal text-caption text-muted">
                {t(EQUIPMENT_KEYS[candidate.equipment])} ·{" "}
                {t(
                  candidate.primaryDetail[0]
                    ? MUSCLE_DETAIL_KEYS[candidate.primaryDetail[0]]
                    : MUSCLE_GROUP_KEYS[candidate.primaryMuscle],
                )}
              </Text>
              {here ? null : (
                <Text numberOfLines={1} className="font-normal text-caption text-subtle">
                  {t("exercise__not_here")}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
