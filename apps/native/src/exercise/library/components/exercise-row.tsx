import { EQUIPMENT_KEYS, MUSCLE_GROUP_KEYS } from "@workspace/shared";
import type { LibraryRow } from "@workspace/sync";
import { ArrowCounterClockwise, Archive, CaretRight } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SwipeRow, type SwipeA11yProps, type SwipeAction } from "@/platform/ui/swipe-row";

import { ExerciseThumbnail } from "./exercise-thumbnail";

export type ExerciseRowProps = {
  exercise: LibraryRow;
  /** `browse` opens the exercise; `pick` toggles it (the selection bar belongs to the picker). */
  mode: "browse" | "pick";
  /** Pick: the 1-based position in the selection, or undefined when not selected. */
  selectedOrder?: number;
  /** Pick: the row cannot be picked (archived, or already in the workout). */
  disabled?: boolean;
  /** Called with the id; without it a browse row is not pressable and shows no chevron. */
  onPress?: (id: string) => void;
  /**
   * Swipe a Custom exercise to archive it (or restore it, once archived). Pass them only in the
   * Custom and Archived views; a row without them does not swipe.
   */
  onArchive?: (id: string, title: string) => void;
  onRestore?: (id: string) => void;
};

/**
 * One exercise: square thumbnail, title, `primary muscle · equipment` in muted text, a Custom
 * badge, then a chevron (browse) or a selection check (pick). Memoised: the list keeps the object
 * of an unchanged row.
 */
export const ExerciseRow = memo(function ExerciseRow({
  exercise,
  mode,
  selectedOrder,
  disabled = false,
  onPress,
  onArchive,
  onRestore,
}: ExerciseRowProps) {
  const { t } = useTranslation();
  const { id, title, isCustom, isArchived } = exercise;
  const selected = selectedOrder !== undefined;
  const swipe = useMemo<SwipeAction[]>(() => {
    if (mode !== "browse" || !isCustom) return [];
    if (isArchived && onRestore) {
      return [
        {
          key: "restore",
          label: t("exercise__detail_restore"),
          icon: ArrowCounterClockwise,
          onPress: () => onRestore(id),
        },
      ];
    }
    if (!isArchived && onArchive) {
      return [
        {
          key: "archive",
          label: t("exercise__detail_archive"),
          icon: Archive,
          tone: "danger",
          onPress: () => onArchive(id, title),
        },
      ];
    }
    return [];
  }, [mode, isCustom, isArchived, id, title, onArchive, onRestore, t]);
  const subtle = useSubtleColor();
  const selectedLabel = selected ? t("exercise__pick_position", { position: selectedOrder }) : "";
  const subtitle = t("exercise__row_subtitle", {
    muscle: t(MUSCLE_GROUP_KEYS[exercise.primaryMuscle]),
    equipment: t(EQUIPMENT_KEYS[exercise.equipment]),
  });
  const content = (a11y: Partial<SwipeA11yProps>) => (
    <Pressable
      {...a11y}
      accessibilityRole={mode === "pick" ? "checkbox" : "button"}
      accessibilityLabel={`${exercise.title}, ${subtitle}${selected ? `, ${selectedLabel}` : ""}`}
      accessibilityHint={mode === "browse" && onPress ? t("exercise__row_open_hint") : undefined}
      accessibilityState={mode === "pick" ? { checked: selected, disabled } : undefined}
      disabled={onPress === undefined || disabled}
      onPress={() => onPress?.(exercise.id)}
      className={`min-h-[72px] flex-row items-center gap-3 border-b border-border px-4 py-2 ${
        selected ? "bg-default" : "bg-background active:bg-default"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <ExerciseThumbnail thumbnailKey={exercise.thumbnailKey} muscle={exercise.primaryMuscle} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink font-medium text-body text-foreground">
            {exercise.title}
          </Text>
          {exercise.isCustom ? (
            <View className="rounded-sm bg-default px-1.5 py-0.5">
              <Text className="text-caption text-muted">{t("exercise__custom_badge")}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} className="text-caption text-muted">
          {subtitle}
        </Text>
      </View>
      {mode === "pick" ? (
        <View
          className={`size-7 items-center justify-center rounded-full border ${
            selected ? "border-identity bg-identity" : "border-border"
          }`}
        >
          {selected ? (
            <Text className="font-semibold text-caption text-on-identity">{selectedOrder}</Text>
          ) : null}
        </View>
      ) : onPress ? (
        <CaretRight size={18} color={subtle} />
      ) : null}
    </Pressable>
  );
  return swipe.length > 0 ? <SwipeRow actions={swipe}>{content}</SwipeRow> : content({});
});
