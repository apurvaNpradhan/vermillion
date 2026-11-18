import type { ProgramDetail } from "@workspace/sync";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useMuscleVolume } from "./use-muscle-volume";

/** Home's one compact Muscles tile: "7 of 12 on target" and a dot per muscle by status. */
export function MusclesTile({ program }: { program: ProgramDetail | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const volume = useMuscleVolume(0, program);
  if (volume.loading || volume.failed) return null;
  const targets = volume.rows.filter((row) => row.status !== null);
  const goal = { done: volume.onTarget, total: targets.length };
  const label = targets.length ? t("muscles__tile_value", goal) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? t("muscles__tile_label", goal) : t("muscles__open")}
      onPress={() => router.push("/muscles")}
      className="flex-row items-center justify-between gap-4 rounded-2xl bg-surface p-4 active:bg-default"
    >
      <View className="gap-1">
        <Text className="text-caption font-medium text-foreground">{t("muscles__open")}</Text>
        {label ? <Text className="text-body tabular-nums text-muted">{label}</Text> : null}
      </View>
      <View className="flex-row gap-1" accessibilityElementsHidden>
        {targets.map((row) => (
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
