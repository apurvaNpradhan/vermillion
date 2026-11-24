import type { ExerciseType, SessionHistory, WeightUnit } from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { topSet } from "../top-set";
import { useTopSetText } from "../use-top-set-text";

/**
 * The last few sessions of an exercise as one line each: its date and the top set. "See all" opens
 * the full history, where every set is listed.
 */
export function RecentTopSets({
  sessions,
  exerciseId,
  type,
  unit,
  timezone,
  onSeeAll,
}: {
  sessions: readonly (Pick<SessionHistory, "id" | "started_at" | "sets"> & { title: string })[];
  exerciseId: string;
  type: ExerciseType;
  unit: WeightUnit;
  timezone: string | null;
  onSeeAll: () => void;
}) {
  const { t, i18n } = useTranslation();
  const setText = useTopSetText(unit);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: timezone ?? undefined,
  });
  const rows = sessions.flatMap((session) => {
    const top = topSet(session.sets, exerciseId, type);
    return top ? [{ session, text: setText(top, type) }] : [];
  });
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
          {t("exercise__recent")}
        </Text>
        <Button variant="tertiary" size="sm" onPress={onSeeAll}>
          <Button.Label>{t("exercise__see_all")}</Button.Label>
        </Button>
      </View>
      {rows.map(({ session, text }) => (
        <View
          key={session.id}
          accessible
          accessibilityLabel={`${date.format(new Date(session.started_at))}, ${text}`}
          className="min-h-11 flex-row items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2"
        >
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-normal text-body text-foreground">
              {date.format(new Date(session.started_at))}
            </Text>
            <Text numberOfLines={1} className="font-normal text-caption text-muted">
              {session.title}
            </Text>
          </View>
          <Text className="text-body font-semibold tabular-nums text-foreground">{text}</Text>
        </View>
      ))}
    </View>
  );
}
