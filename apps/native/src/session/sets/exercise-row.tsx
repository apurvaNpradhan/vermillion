import type { SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { useThemeColor } from "heroui-native";
import { CaretDown, CaretUp, Check, DotsThreeVertical } from "phosphor-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail, PinnedNote } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ReorderBlock, ReorderTrigger, SupersetBracket } from "@/training";

/**
 * One exercise of the accordion. Collapsed it is the header alone: thumbnail, name, "2/4 · 60 kg × 8"
 * (a solid tick instead of the count when every set is done, with the name dimmed) and a chevron.
 * Open it also shows its pinned note, progression chip and its body (chips, set grid). A superset
 * member carries the bracket.
 */
export const ExerciseRow = memo(function ExerciseRow({
  exercise,
  place,
  progress,
  summary,
  expanded,
  done,
  readOnly,
  onView,
  onToggle,
  onMenu,
  onReorder,
  children,
  progression,
}: {
  exercise: SessionExerciseDetail;
  place: SupersetPlace;
  /** "2/4". */
  progress: string;
  /** The done summary after the progress; empty while sets remain. */
  summary: string;
  /** The body is shown; a closed exercise renders no sets, chips or notes. */
  expanded: boolean;
  /** Every set is ticked (and there is one). */
  done: boolean;
  readOnly: boolean;
  onView: (exerciseId: string) => void;
  /** Opens a closed exercise, closes an open one. */
  onToggle: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  /** Long press on the header: open the Reorder view. */
  onReorder: () => void;
  /** The open body: chips, note, set grid. Not built while closed. */
  children?: ReactNode;
  progression?: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const background = useThemeColor("background");
  const info = exercise.exercise;
  const name = exercise.title || t("training__exercise_missing");
  const grouped = place !== "none";
  const thumbnail = (size: number) => (
    <ExerciseThumbnail
      title={name}
      imageMediaId={info?.imageMediaId}
      thumbnailKey={info?.thumbnailKey ?? null}
      size={size}
    />
  );
  const subtitle = summary === "" ? progress : `${progress} · ${summary}`;
  const doneText = summary === "" ? progress : summary;
  const toggle = () => onToggle(exercise.id);
  const toggleLabel = t(expanded ? "session__collapse_exercise" : "session__expand_exercise", {
    title: name,
  });

  const headerLabel = t(grouped ? "session__superset_header" : "session__exercise_header", {
    title: name,
    summary: done ? t("session__exercise_completed", { summary: subtitle }) : subtitle,
  });

  return (
    <ReorderBlock onReorder={onReorder} enabled={!readOnly} motion={false}>
      <ReorderTrigger className="min-h-[64px] flex-row items-center bg-background">
        <SupersetBracket place={place} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? t("session__view_exercise_named", { title: name }) : toggleLabel
          }
          accessibilityState={expanded ? undefined : { expanded }}
          onPress={expanded ? () => onView(exercise.exerciseId) : toggle}
          className={`min-h-[64px] min-w-12 items-center justify-center py-2 ${grouped ? "pl-6" : "pl-4"} active:bg-default`}
        >
          {thumbnail(40)}
        </Pressable>
        <View className="min-h-[64px] min-w-0 flex-1 justify-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={headerLabel}
            accessibilityState={{ expanded }}
            accessibilityHint={readOnly ? undefined : t("training__drag_hint")}
            accessibilityActions={
              readOnly ? undefined : [{ name: "reorder", label: t("training__reorder") }]
            }
            onAccessibilityAction={(event) => {
              if (!readOnly && event.nativeEvent.actionName === "reorder") onReorder();
            }}
            onPress={toggle}
            className="min-h-11 justify-center gap-0.5 py-2 pl-3 active:bg-default"
          >
            {place === "first" ? (
              <Text className="font-semibold text-overline uppercase text-foreground">
                {t("training__superset")}
              </Text>
            ) : null}
            <Text
              numberOfLines={2}
              className={`font-medium text-body ${done ? "text-subtle" : "text-foreground"}`}
            >
              {name}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {done ? (
                <View className="h-4 w-4 items-center justify-center rounded bg-foreground">
                  <Check size={12} weight="bold" color={background} />
                </View>
              ) : null}
              <Text
                numberOfLines={1}
                className="font-normal min-w-0 flex-shrink text-caption text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {done ? doneText : subtitle}
              </Text>
            </View>
            {expanded ? (
              <ExerciseNotes pinned={exercise.pinnedNote} lastTime={exercise.lastNote} />
            ) : null}
          </Pressable>
          {expanded ? progression : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded }}
          onPress={toggle}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
        >
          {expanded ? <CaretUp size={20} color={subtle} /> : <CaretDown size={20} color={subtle} />}
        </Pressable>
        {expanded && !readOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("training__row_menu", { title: name })}
            onPress={() => onMenu(exercise)}
            hitSlop={4}
            className="h-11 w-11 items-center justify-center"
          >
            <DotsThreeVertical size={20} color={subtle} />
          </Pressable>
        ) : null}
      </ReorderTrigger>
      {expanded ? <View className="gap-3 px-3 pb-4 pt-1">{children}</View> : null}
    </ReorderBlock>
  );
});

/**
 * The exercise's pinned note (a pin, then the text) and, while the row is open, the note it had
 * last time in faded text under it. Nothing renders when both are empty.
 */
function ExerciseNotes({ pinned, lastTime }: { pinned: string | null; lastTime: string | null }) {
  const { t } = useTranslation();
  if (pinned === null && lastTime === null) return null;
  return (
    <View className="gap-0.5 pt-0.5">
      {pinned === null ? null : <PinnedNote note={pinned} />}
      {lastTime === null ? null : (
        <Text numberOfLines={2} className="font-normal text-caption text-muted">
          {t("session__last_time", { note: lastTime })}
        </Text>
      )}
    </View>
  );
}
