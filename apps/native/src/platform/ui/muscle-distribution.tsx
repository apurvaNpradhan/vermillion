import { haptic } from "@/platform/haptics";
import {
  MUSCLE_GROUP_KEYS,
  muscleDistribution,
  type DistributionExercise,
  type LoggedSet,
} from "@workspace/shared";
import { useState } from "react";
import { Button } from "./button";
import { Pressable, Text, View } from "react-native";
import { BodyMapPair, isBodyGroup, type BodyGroup } from "@/body-map";
import { useTranslation } from "@/platform/i18n";
import { splitShares } from "./muscle-split";

/** Counted sets, ranked; the body intensity is relative to the most trained muscle. */
export function MuscleDistribution({
  sets,
  exercises,
  preview = false,
  split = false,
  title,
}: {
  preview?: boolean;
  /** Muscle split: bars with each muscle's percentage of the sets, and no body map. */
  split?: boolean;
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
  if (split) {
    const shares = splitShares(loads);
    const shown = preview && !showAll ? shares.slice(0, 3) : shares;
    return (
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
          {title ?? t("session__muscle_split")}
        </Text>
        {shown.map((share) => (
          <View key={share.muscle} className="gap-1">
            <Text className="text-body text-foreground">{t(MUSCLE_GROUP_KEYS[share.muscle])}</Text>
            <View className="flex-row items-center gap-3">
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-default">
                <View
                  className="h-2 rounded-full bg-foreground"
                  style={{ width: `${share.width * 100}%` }}
                />
              </View>
              <Text
                numberOfLines={1}
                className="w-12 text-right text-body text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {share.percent}%
              </Text>
            </View>
          </View>
        ))}
        {preview && !showAll && shares.length > 3 ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center self-start"
            onPress={() => {
              haptic.tick();
              setShowAll(true);
            }}
          >
            <Text className="font-medium text-body text-identity">
              {t("session__show_more_muscles", { count: shares.length - 3 })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
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
              {t("stats__sets", {
                count: load.sets,
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
        <Button
          variant="ghost"
          onPress={() => {
            haptic.tick();
            setShowAll(true);
          }}
        >
          <Button.Label>{t("session__show_all_muscles")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
