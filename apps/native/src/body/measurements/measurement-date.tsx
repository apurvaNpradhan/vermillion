import { stepZoned } from "@workspace/shared";
import { useThemeColor } from "heroui-native";
import { Minus, Plus } from "phosphor-react-native";
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
  timeZone,
  onChange,
}: {
  value: string;
  /** The account time zone that `local_date` is derived in; display and stepping use it too. */
  timeZone: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const foreground = useThemeColor("foreground");
  const date = new Date(value);
  const label = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
  const step = (part: Part, direction: number) => {
    const next = new Date(stepZoned(value, timeZone, part, direction));
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
        <Text className="font-normal text-body text-muted">{label}</Text>
      </Pressable>
      {open
        ? parts.map((part) => (
            <View key={part} className="flex-row items-center justify-between gap-2">
              <Text className="font-normal text-body text-muted">{t(keys[part])}</Text>
              <Button
                size="sm"
                variant="tertiary"
                accessibilityLabel={t("body__earlier", { part: t(keys[part]) })}
                onPress={() => step(part, -1)}
              >
                <Minus size={20} color={foreground} />
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                accessibilityLabel={t("body__later", { part: t(keys[part]) })}
                onPress={() => step(part, 1)}
              >
                <Plus size={20} color={foreground} />
              </Button>
            </View>
          ))
        : null}
    </View>
  );
}
