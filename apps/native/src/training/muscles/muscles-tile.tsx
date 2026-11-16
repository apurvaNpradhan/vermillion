import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useMuscleVolume } from "./use-muscle-volume";

/** Home's one compact Muscles tile: "7 of 12 on target" and a dot per muscle by status. */
export function MusclesTile() {
  const { t } = useTranslation();
  const router = useRouter();
  const volume = useMuscleVolume(0);
  if (volume.loading || volume.failed) return null;
  const label = t("muscles__tile_value", { done: volume.onTarget, total: volume.rows.length });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("muscles__tile_label", {
        done: volume.onTarget,
        total: volume.rows.length,
      })}
      onPress={() => router.push("/muscles")}
      className="flex-row items-center justify-between gap-4 rounded-2xl bg-surface p-4 active:bg-default"
    >
      <View className="gap-1">
        <Text className="text-caption font-medium text-foreground">{t("muscles__open")}</Text>
        <Text className="text-body tabular-nums text-muted">{label}</Text>
      </View>
      <View className="flex-row gap-1" accessibilityElementsHidden>
        {volume.rows.map((row) => (
          <View
            key={row.muscle}
            className={`h-2.5 w-2.5 rounded-full ${
              row.status === "on_target"
                ? "bg-success"
                : row.status === "above"
                  ? "bg-foreground"
                  : "bg-default"
            }`}
          />
        ))}
      </View>
    </Pressable>
  );
}
