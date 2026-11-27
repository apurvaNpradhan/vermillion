import { Play } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

/** How many exercises the card lists before it says "and N more". */
const LISTED = 5;

export type NextWorkoutExercise = {
  id: string;
  title: string;
  /** Last time's top set as text; null when the exercise has no history. */
  lastTopSet: string | null;
};

/**
 * Home's hero, the Next workout: where the program stands ("Week 3 · Workout 2"), the workout's
 * name, each exercise with last time's top set, how long the last workout took, one big Start and
 * "Start empty workout" as a quiet text link under it. While another workout is open Start turns
 * quiet and the link goes; when this card's workout is the open one, the button is Resume.
 */
export function NextWorkoutCard({
  eyebrow,
  title,
  meta,
  exercises,
  lastDuration,
  workoutOpen,
  resuming,
  resumesRun,
  onStart,
  onStartEmpty,
}: {
  /** "Week 3 · Workout 2". Null when it has nothing to say. */
  eyebrow: string | null;
  /** The workout's name; null when there is no workout to run, only an empty Session. */
  title: string | null;
  meta: string | null;
  exercises: readonly NextWorkoutExercise[];
  /** "Last time 52 min"; null when the workout was not done yet. */
  lastDuration: string | null;
  /** A workout is open: Start is quiet and there is no empty start. */
  workoutOpen: boolean;
  /** The open workout is this card's: the button resumes it instead of starting it again. */
  resuming: boolean;
  resumesRun: boolean;
  onStart: () => void;
  onStartEmpty: () => void;
}) {
  const { t } = useTranslation();
  const onAction = useThemeColor("accent-foreground");
  const subtle = useSubtleColor();
  const listed = exercises.slice(0, LISTED);
  const more = exercises.length - listed.length;
  return (
    <View className="gap-4 rounded-2xl bg-surface p-4">
      {title === null ? null : (
        <View className="gap-1">
          {eyebrow ? (
            <Text className="text-caption font-medium tabular-nums text-muted">{eyebrow}</Text>
          ) : null}
          <Text numberOfLines={1} className="text-title-xl font-semibold text-foreground">
            {title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} className="font-normal text-body tabular-nums text-muted">
              {lastDuration ? `${meta} · ${lastDuration}` : meta}
            </Text>
          ) : null}
        </View>
      )}
      {listed.length > 0 ? (
        <View className="gap-2">
          {listed.map((exercise) => (
            <View key={exercise.id} className="flex-row items-baseline justify-between gap-3">
              <Text numberOfLines={1} className="font-normal flex-1 text-body text-foreground">
                {exercise.title}
              </Text>
              {exercise.lastTopSet ? (
                <Text className="font-normal text-body tabular-nums text-muted">
                  {exercise.lastTopSet}
                </Text>
              ) : null}
            </View>
          ))}
          {more > 0 ? (
            <Text className="font-normal text-caption text-muted">
              {t("home__more_exercises", { count: more })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {resumesRun ? (
        <Text className="text-caption text-muted">{t("run__start_resumes")}</Text>
      ) : null}
      {title !== null ? (
        <Button
          size="lg"
          variant={workoutOpen && !resuming ? "secondary" : "primary"}
          className="h-14 w-full"
          onPress={onStart}
        >
          <Play size={20} color={workoutOpen && !resuming ? subtle : onAction} />
          <Button.Label>{t(resuming ? "session__resume" : "session__start")}</Button.Label>
        </Button>
      ) : null}
      {!workoutOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={onStartEmpty}
          className="min-h-11 items-center justify-center active:opacity-60"
        >
          <Text className="font-medium text-body text-muted">{t("home__start_empty")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
