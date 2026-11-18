import { Play } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

/**
 * Home's Next workout: its name, how many exercises and about how long, one big Start (Resume when
 * a Session is open) and Start empty under it as the quiet alternative. Start empty stays while a
 * Session is open: it asks first, through the Session conflict sheet, what to do with that one.
 */
export function NextWorkoutCard({
  eyebrow,
  title,
  meta,
  resuming,
  onStart,
  onStartEmpty,
}: {
  /** "Next · Day 2 of 4", or "In progress". Null when it has nothing to say. */
  eyebrow: string | null;
  /** The workout's name; null when there is no workout to run, only an empty Session. */
  title: string | null;
  meta: string | null;
  resuming: boolean;
  onStart: () => void;
  onStartEmpty: () => void;
}) {
  const { t } = useTranslation();
  const onAction = useThemeColor("accent-foreground");
  return (
    <View className="gap-4 rounded-2xl bg-surface p-4">
      {title === null ? null : (
        <View className="gap-1">
          {eyebrow ? (
            <Text className="text-caption font-medium text-identity">{eyebrow}</Text>
          ) : null}
          <Text numberOfLines={1} className="text-title-lg font-semibold text-foreground">
            {title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} className="text-body tabular-nums text-muted">
              {meta}
            </Text>
          ) : null}
        </View>
      )}
      <Button size="lg" className="h-14 w-full" onPress={title === null ? onStartEmpty : onStart}>
        <Play size={20} weight="fill" color={onAction} />
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
