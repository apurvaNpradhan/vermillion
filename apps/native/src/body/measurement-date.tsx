import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
const parts = ["year", "month", "day", "hour", "minute"] as const; // Safety: fixed calendar fields retain their literal types.
type Part = (typeof parts)[number];
const keys = {
  year: "body__year",
  month: "body__month",
  day: "body__day",
  hour: "body__hour",
  minute: "body__minute",
} as const; // Safety: literal i18n keys.
export function MeasurementDate({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const date = new Date(value);
  const label = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
  const step = (part: Part, direction: number) => {
    const next = new Date(value);
    if (part === "year" || part === "month") {
      const day = next.getDate();
      next.setDate(1);
      if (part === "year") next.setFullYear(next.getFullYear() + direction);
      else next.setMonth(next.getMonth() + direction);
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    } else if (part === "day") next.setDate(next.getDate() + direction);
    else if (part === "hour") next.setHours(next.getHours() + direction);
    else next.setMinutes(next.getMinutes() + direction);
    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - 10);
    if (next <= new Date() && next >= oldest) onChange(next.toISOString());
  };
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("body__change_date", { date: label })}
        onPress={() => setOpen(!open)}
        className="py-3"
      >
        <Text className="text-body text-muted">{label}</Text>
      </Pressable>
      {open
        ? parts.map((part) => (
            <View key={part} className="flex-row items-center justify-between gap-2">
              <Text className="text-body text-muted">{t(keys[part])}</Text>
              <Button
                size="sm"
                variant="tertiary"
                accessibilityLabel={t("body__earlier", { part: t(keys[part]) })}
                onPress={() => step(part, -1)}
              >
                <Button.Label>{t("body__minus")}</Button.Label>
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                accessibilityLabel={t("body__later", { part: t(keys[part]) })}
                onPress={() => step(part, 1)}
              >
                <Button.Label>{t("body__plus")}</Button.Label>
              </Button>
            </View>
          ))
        : null}
    </View>
  );
}
