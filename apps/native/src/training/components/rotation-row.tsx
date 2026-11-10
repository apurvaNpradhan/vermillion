import type { TranslationKey } from "@workspace/i18n";
import { derivedTitleMuscles } from "@workspace/shared";
import type { ProgramSlotDetail } from "@workspace/sync";
import { Barbell, DotsSixVertical, DotsThreeVertical, Moon } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { MuscleIcon } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { displayTitle } from "../derived-title";
import { estimateMinutes } from "../estimate";

const TILE = 40;

/** The name a Slot's Workout shows, as in the lists: its own title or the muscles it hits. */
export function slotTitle(slot: ProgramSlotDetail, t: (key: TranslationKey) => string) {
  const muscles =
    slot.workout?.exercises.flatMap((entry) =>
      entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
    ) ?? [];
  return displayTitle(slot.workout?.title ?? null, muscles, (key) => t(key));
}

/**
 * One Slot of the Rotation: its day number, then the Workout (tile, name, `6 exercises · ~55 min`,
 * and `×2` when it fills several Slots) or a quiet Rest row. While the list is dragged it is a
 * single line.
 */
export const RotationRow = memo(function RotationRow({
  slot,
  number,
  title,
  repeats,
  collapsed,
  onOpen,
  onMenu,
}: {
  slot: ProgramSlotDetail;
  /** The day, from 1. */
  number: number;
  /** The Workout's display name; unused for Rest. */
  title: string;
  /** How many Slots the Workout fills; 1 shows no badge. */
  repeats: number;
  collapsed: boolean;
  onOpen: (slot: ProgramSlotDetail) => void;
  onMenu: (slot: ProgramSlotDetail) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const workout = slot.workout;
  const name = workout ? title : t("training__rest_day");

  if (collapsed) {
    return (
      <View className="h-14 flex-row items-center gap-3 border-b border-border bg-surface px-4">
        <Text className="w-6 text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          {number}
        </Text>
        <Text
          numberOfLines={1}
          className={`flex-1 text-body ${workout ? "font-medium text-foreground" : "text-muted"}`}
        >
          {name}
        </Text>
        <DotsSixVertical size={20} color={subtle} weight="bold" />
      </View>
    );
  }

  const menu = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("training__slot_menu", { number })}
      onPress={() => onMenu(slot)}
      hitSlop={4}
      className="h-12 w-12 items-center justify-center"
    >
      <DotsThreeVertical size={20} color={subtle} weight="bold" />
    </Pressable>
  );

  if (!workout) {
    return (
      <View
        accessible={false}
        className="min-h-14 flex-row items-center border-b border-border bg-background"
      >
        <View
          accessibilityLabel={t("training__slot_rest_label", { number })}
          accessible
          className="min-h-14 flex-1 flex-row items-center gap-3 pl-4"
        >
          <Text className="w-6 text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
            {number}
          </Text>
          <View
            className="items-center justify-center rounded-lg"
            style={{ width: TILE, height: TILE }}
          >
            <Moon size={20} color={subtle} />
          </View>
          <Text className="flex-1 text-body text-muted">{name}</Text>
        </View>
        {menu}
      </View>
    );
  }

  const muscles = workout.exercises.flatMap((entry) =>
    entry.primaryMuscle === null ? [] : [entry.primaryMuscle],
  );
  const main = derivedTitleMuscles(muscles)[0];
  const count = workout.exercises.length;
  const meta =
    count === 0
      ? t("training__workout_empty_meta")
      : t("training__workout_meta", { count, minutes: estimateMinutes(workout.exercises) });

  return (
    <View className="min-h-[72px] flex-row items-center border-b border-border bg-background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("training__slot_label", { number, title })}, ${meta}${
          repeats > 1 ? `, ${t("training__repeat_badge_label", { count: repeats })}` : ""
        }`}
        accessibilityHint={t("training__slot_open_hint")}
        onPress={() => onOpen(slot)}
        className="min-h-[72px] flex-1 flex-row items-center gap-3 py-2 pl-4 active:bg-default"
      >
        <Text className="w-6 text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          {number}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="items-center justify-center rounded-xl bg-default"
          style={{ width: TILE, height: TILE }}
        >
          {main ? (
            <MuscleIcon muscle={main} size={TILE - 8} />
          ) : (
            <Barbell size={22} color={subtle} />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-medium text-body text-foreground">
            {title}
          </Text>
          <Text numberOfLines={1} className="text-caption text-muted">
            {meta}
          </Text>
        </View>
        {repeats > 1 ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="rounded-full bg-default px-2 py-0.5"
          >
            <Text className="text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
              {t("training__repeat_badge", { count: repeats })}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {menu}
    </View>
  );
});
