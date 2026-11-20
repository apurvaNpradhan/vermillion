import type { SupersetPlace } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { DotsThreeVertical, Plus } from "phosphor-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail, PinnedNote } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ReorderHeader, SupersetBracket } from "@/training";

const HIDDEN = { display: "none" } as const;
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
  warm,
  onView,
  onToggle,
  onMenu,
  onAddSet,
  children,
  progression,
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
  /** Build the body while closed (hidden), so opening it only flips visibility. */
  warm: boolean;
  onView: (exerciseId: string) => void;
  onToggle: (exerciseId: string) => void;
  onMenu: (exercise: SessionExerciseDetail) => void;
  onAddSet: (exerciseId: string) => void;
  /** The open body: note, rest chip, set grid. */
  children: ReactNode;
  progression?: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const info = exercise.exercise;
  const name = exercise.title;
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

  if (dragging) {
    return (
      <View
        className={`h-14 flex-row items-center gap-3 bg-surface pr-4 ${grouped ? "pl-6" : "pl-4"}`}
      >
        <SupersetBracket place={place} />
        {thumbnail(32)}
        <Text numberOfLines={1} className="flex-1 font-medium text-body text-foreground">
          {name || t(FALLBACK_TITLE_KEY)}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <ReorderHeader
        className={`min-h-[64px] flex-row items-center ${open ? "bg-background" : "bg-surface"}`}
      >
        <SupersetBracket place={place} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__view_exercise_named", { title: name })}
          onPress={() => onView(exercise.exerciseId)}
          className={`min-h-[64px] min-w-12 items-center justify-center py-2 ${grouped ? "pl-6" : "pl-4"} active:bg-default`}
        >
          {thumbnail(40)}
        </Pressable>
        <View className="min-h-[64px] min-w-0 flex-1 justify-center">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${grouped ? `${t("training__superset_label")}, ` : ""}${name}, ${subtitle}`}
            accessibilityHint={
              readOnly
                ? t("training__row_open_hint")
                : `${t("training__row_open_hint")}. ${t("training__drag_hint")}`
            }
            onPress={() => onToggle(exercise.id)}
            className="min-h-11 justify-center gap-0.5 py-2 pl-3 active:bg-default"
          >
            {place === "first" ? (
              <Text className="font-semibold text-overline uppercase text-identity">
                {t("training__superset")}
              </Text>
            ) : null}
            <Text numberOfLines={2} className="font-medium text-body text-foreground">
              {name || t(FALLBACK_TITLE_KEY)}
            </Text>
            <Text
              numberOfLines={1}
              className="text-caption text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {subtitle}
            </Text>
            <ExerciseNotes
              pinned={exercise.pinnedNote}
              lastTime={open ? exercise.lastNote : null}
            />
          </Pressable>
          {progression}
        </View>
        {showAddSet && !open && !readOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__add_set_to", { title: name })}
            onPress={() => onAddSet(exercise.id)}
            hitSlop={4}
            className="h-9 flex-row items-center gap-1 rounded-full bg-default px-3 active:bg-field"
          >
            <Plus size={20} color={subtle} />
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
            <DotsThreeVertical size={20} color={subtle} />
          </Pressable>
        )}
      </ReorderHeader>
      {open || warm ? (
        <View
          className="gap-3 bg-default/30 px-3 py-4"
          style={open ? undefined : HIDDEN}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        >
          {children}
        </View>
      ) : null}
    </View>
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
        <Text numberOfLines={2} className="text-caption text-muted opacity-70">
          {t("session__last_time", { note: lastTime })}
        </Text>
      )}
    </View>
  );
}
