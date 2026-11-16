import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { HabitGrid } from "@/platform/ui/habit-grid";
import type { weighInDays } from "@workspace/shared";

export function WeighInGrid({ days }: { days: ReturnType<typeof weighInDays> }) {
  const { t } = useTranslation();
  const count = days.filter((day) => day.logged).length;
  return (
    <View className="gap-3">
      <HabitGrid
        cells={days.map((day) => day.logged)}
        tone="success"
        label={t("body__habit_count", { count })}
      />
      <Text className="text-caption text-muted">{t("body__habit_count", { count })}</Text>
    </View>
  );
}
