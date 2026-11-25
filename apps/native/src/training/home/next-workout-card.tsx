import { Play } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
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
 * Home's hero, the Next workout: where the program stands ("Week 3 · Day 2"), the workout's name,
 * each exercise with last time's top set, how long the last session took, one big Start (Resume
 * when a Session is open) and Start empty under it as the quiet alternative. Start empty stays
 * while a Session is open: it asks first, through the Session conflict sheet, what to do with
 * that one.
 */
export function NextWorkoutCard({
  eyebrow,
  title,
  meta,
  exercises,
  lastDuration,
  resuming,
  resumesRun,
  onStart,
  onStartEmpty,
}: {
  /** "Week 3 · Day 2", or "In progress". Null when it has nothing to say. */
  eyebrow: string | null;
  /** The workout's name; null when there is no workout to run, only an empty Session. */
  title: string | null;
  meta: string | null;
  exercises: readonly NextWorkoutExercise[];
  /** "Last time 52 min"; null when the workout was not done yet. */
  lastDuration: string | null;
  resuming: boolean;
  resumesRun: boolean;
  onStart: () => void;
  onStartEmpty: () => void;
}) {
  const { t } = useTranslation();
  const onAction = useThemeColor("accent-foreground");
  const listed = resuming ? [] : exercises.slice(0, LISTED);
  const more = resuming ? 0 : exercises.length - listed.length;
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
              {lastDuration && !resuming ? `${meta} · ${lastDuration}` : meta}
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
      <Button size="lg" className="h-14 w-full" onPress={title === null ? onStartEmpty : onStart}>
        <Play size={20} color={onAction} />
        <Button.Label>
          {t(
            title === null ? "home__start_empty" : resuming ? "session__resume" : "session__start",
          )}
        </Button.Label>
      </Button>
      {title !== null ? (
        <Button variant="secondary" className="w-full" onPress={onStartEmpty}>
          <Button.Label>{t("home__start_empty")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
