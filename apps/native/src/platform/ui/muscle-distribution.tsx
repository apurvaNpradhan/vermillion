import {
  MUSCLE_GROUP_KEYS,
  muscleDistribution,
  type DistributionExercise,
  type LoggedSet,
} from "@workspace/shared";
import { useState } from "react";
import { Button } from "./button";
import { Text, View } from "react-native";
import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { useTranslation } from "@/platform/i18n";

/** Counted sets, ranked; the body intensity is relative to the most trained muscle. */
export function MuscleDistribution({
  sets,
  exercises,
  preview = false,
  title,
}: {
  preview?: boolean;
  title?: string;
  sets: readonly LoggedSet[];
  exercises: readonly DistributionExercise[];
}) {
  const { t, i18n } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const loads = muscleDistribution(sets, exercises);
  const max = loads[0]?.sets ?? 0;
  const intensity: Partial<Record<BodyGroup, number>> = {};
  for (const load of loads) if (isBodyGroup(load.muscle)) intensity[load.muscle] = load.sets / max;
  if (!loads.length) return null;
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {title ?? t("exercise__muscle_distribution")}
      </Text>
      <BodyMapPair intensity={intensity} />
      <Text className="text-caption text-muted">
        {t("exercise__muscle_scale", { value: new Intl.NumberFormat(i18n.language).format(max) })}
      </Text>
      {(preview && !showAll ? loads.slice(0, 3) : loads).map((load) => (
        <View key={load.muscle} className="gap-1">
          <View className="flex-row justify-between">
            <Text className="text-body text-foreground">{t(MUSCLE_GROUP_KEYS[load.muscle])}</Text>
            <Text className="text-body text-foreground" style={{ fontVariant: ["tabular-nums"] }}>
              {t("exercise__muscle_sets", {
                value: new Intl.NumberFormat(i18n.language).format(load.sets),
              })}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-default">
            <View
              className="h-2 rounded-full bg-foreground"
              style={{ width: `${(load.sets / max) * 100}%` }}
            />
          </View>
        </View>
      ))}
      {preview && !showAll && loads.length > 3 ? (
        <Button variant="ghost" onPress={() => setShowAll(true)}>
          <Button.Label>{t("session__show_all_muscles")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
