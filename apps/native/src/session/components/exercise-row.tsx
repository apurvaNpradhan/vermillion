import type { SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { DotsSixVertical, DotsThreeVertical, Plus } from "phosphor-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SupersetBracket } from "@/training";

const FALLBACK_TITLE_KEY = "training__exercise_missing";

/**
 * One exercise of the accordion. Collapsed it reads "2/4" or "4/4 · 60 kg × 8, 8, 7, 6"; while a
 * row is dragged it is a single line. Open it shows its pinned note and its body (rest chip, set
 * grid). A superset member carries the bracket, and the whole block opens together.
 */
export const ExerciseRow = memo(function ExerciseRow({
  exercise,
  place,
  open,
  dragging,
  progress,
  summary,
  showAddSet,
  readOnly,
  onToggle,
  onMenu,
  onAddSet,
  children,
}: {
  exercise: SessionExerciseDetail;
  place: SupersetPlace;
  open: boolean;
  /** A row is being dragged: every row is one line. */
  dragging: boolean;
  /** "2/4". */
  progress: string;
  /** The done summary after the progress; empty while sets remain. */
  summary: string;
  /** "+ Add set" on this collapsed row: it was just finished and is resting. */
  showAddSet: boolean;
  readOnly: boolean;
  onToggle: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  /** The open body: note, rest chip, set grid. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const info = exercise.exercise;
  const name = exercise.title;
  const grouped = place !== "none";
  const thumbnail = (size: number) =>
    info ? (
      <ExerciseThumbnail thumbnailKey={info.thumbnailKey} muscle={info.primaryMuscle} size={size} />
    ) : (
      <View className="rounded-lg bg-default" style={{ width: size, height: size }} />
    );
  const subtitle = summary === "" ? progress : `${progress} · ${summary}`;

  if (dragging) {
    return (
      <View
        className={`h-14 flex-row items-center gap-3 border-b border-border bg-surface pr-4 ${grouped ? "pl-6" : "pl-4"}`}
      >
        <SupersetBracket place={place} />
        {thumbnail(32)}
        <Text numberOfLines={1} className="flex-1 font-medium text-body text-foreground">
          {name || t(FALLBACK_TITLE_KEY)}
        </Text>
        <DotsSixVertical size={20} color={subtle} weight="bold" />
      </View>
    );
  }

  return (
    <View>
      <View
        className={`min-h-[64px] flex-row items-center border-b border-border ${open ? "bg-background" : "bg-surface"}`}
      >
        <SupersetBracket place={place} />
        <View accessible accessibilityLabel={t("training__drag_hint")} className="pl-2">
          <DotsSixVertical size={18} color={subtle} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${grouped ? `${t("training__superset_label")}, ` : ""}${name}, ${subtitle}`}
          accessibilityHint={t("training__row_open_hint")}
          onPress={() => onToggle(exercise.id)}
          className={`min-h-[64px] flex-1 flex-row items-center gap-3 py-2 ${grouped ? "pl-6" : "pl-4"} active:bg-default`}
        >
          {thumbnail(open ? 44 : 36)}
          <View className="flex-1 gap-0.5">
            {place === "first" ? (
              <Text className="font-semibold text-overline uppercase text-identity">
                {t("training__superset")}
              </Text>
            ) : null}
            <Text numberOfLines={1} className="font-medium text-body text-foreground">
              {name}
            </Text>
            <Text
              numberOfLines={1}
              className="text-caption text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {subtitle}
            </Text>
          </View>
        </Pressable>
        {showAddSet && !open && !readOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__add_set_to", { title: name })}
            onPress={() => onAddSet(exercise.id)}
            hitSlop={4}
            className="h-9 flex-row items-center gap-1 rounded-full bg-default px-3 active:bg-field"
          >
            <Plus size={14} weight="bold" color={subtle} />
            <Text className="font-medium text-caption text-foreground">
              {t("session__add_set")}
            </Text>
          </Pressable>
        ) : null}
        {readOnly ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("training__row_menu", { title: name })}
            onPress={() => onMenu(exercise)}
            hitSlop={4}
            className="h-12 w-12 items-center justify-center"
          >
            <DotsThreeVertical size={20} color={subtle} weight="bold" />
          </Pressable>
        )}
      </View>
      {open ? <View className="gap-3 border-b border-border px-3 py-3">{children}</View> : null}
    </View>
  );
});
