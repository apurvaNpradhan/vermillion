import { EQUIPMENT_KEYS } from "@workspace/shared";
import type { LibraryRow } from "@workspace/sync";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { ExerciseThumbnail } from "../../library/components/exercise-thumbnail";

const CARD_WIDTH = 132;

/**
 * "Swap for": a horizontal row of cards, one per exercise that works the same muscle with other
 * equipment. Renders nothing without candidates.
 */
export function SwapRow({
  candidates,
  onOpen,
}: {
  candidates: readonly LibraryRow[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (candidates.length === 0) return null;
  return (
    <View className="gap-3">
      <View className="gap-0.5 px-4">
        <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
          {t("exercise__swap_title")}
        </Text>
        <Text className="text-caption text-muted">{t("exercise__swap_hint")}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4"
      >
        {candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={t("exercise__swap_open", { title: candidate.title })}
            onPress={() => onOpen(candidate.id)}
            className="gap-2 rounded-xl border border-border bg-surface p-2 active:bg-default"
            style={{ width: CARD_WIDTH }}
          >
            <ExerciseThumbnail
              thumbnailKey={candidate.thumbnailKey}
              muscle={candidate.primaryMuscle}
              size={CARD_WIDTH - 18}
            />
            <Text numberOfLines={2} className="min-h-10 text-caption font-medium text-foreground">
              {candidate.title}
            </Text>
            <Text numberOfLines={1} className="text-caption text-muted">
              {t(EQUIPMENT_KEYS[candidate.equipment])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
