import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import type { weighInDays } from "@workspace/shared";
export function WeighInGrid({ days }: { days: ReturnType<typeof weighInDays> }) {
  const { t, i18n } = useTranslation();
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(value),
    );
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {days.map((day) => (
          <View
            key={day.date}
            accessible
            accessibilityLabel={t(day.logged ? "body__day_logged" : "body__day_missing", {
              date: date(day.date),
            })}
            className={`h-7 w-7 items-center justify-center rounded-sm ${day.logged ? "bg-foreground" : "bg-default"}`}
          >
            <Text className={`text-caption ${day.logged ? "text-background" : "text-muted"}`}>
              {Number(day.date.slice(-2))}
            </Text>
          </View>
        ))}
      </View>
      <Text className="text-caption text-muted">
        {t("body__habit_count", { count: days.filter((d) => d.logged).length })}
      </Text>
    </View>
  );
}
