import { weekDays } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { Button } from "@/platform/ui/button";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { usePreferences } from "@/preferences";
import { formatCalendarDate } from "@/body/photos/local-date";
import { monthDays } from "./photo-calendar";

export function PhotoDatePicker({
  dates,
  selected,
  title,
  onPick,
  onClose,
}: {
  dates: string[];
  selected: string | null;
  title: string;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const sheet = useSheetPresent();
  const { t, i18n } = useTranslation();
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const [month, setMonth] = useState(selected?.slice(0, 7) ?? months.at(-1) ?? "");
  const index = months.indexOf(month);
  const enabled = new Set(dates);
  const dayFormat = new Intl.NumberFormat(i18n.language);
  const { preferences } = usePreferences();
  const { weekStart } = preferences.ui;
  const weekdays = weekDays(weekStart).map((day) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 10, 1 + day)),
    ),
  );
  return (
    <BottomSheet
      isOpen={sheet.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="bg-overlay"
          contentContainerClassName="gap-3 p-4"
        >
          {sheet.probe}
          <BottomSheet.Title>{title}</BottomSheet.Title>
          <View className="flex-row items-center justify-between gap-2">
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={index <= 0}
              onPress={() => {
                const value = months[index - 1];
                if (value) setMonth(value);
              }}
            >
              <Button.Label>{t("body__previous_month")}</Button.Label>
            </Button>
            <Text
              accessibilityRole="header"
              className="font-normal flex-1 text-center text-label text-foreground"
            >
              {new Intl.DateTimeFormat(i18n.language, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${month}-01T00:00:00Z`))}
            </Text>
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={index >= months.length - 1}
              onPress={() => {
                const value = months[index + 1];
                if (value) setMonth(value);
              }}
            >
              <Button.Label>{t("body__next_month")}</Button.Label>
            </Button>
          </View>
          <View className="flex-row">
            {weekdays.map((label, day) => (
              <Text key={day} className="font-normal flex-1 text-center text-caption text-muted">
                {label}
              </Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {monthDays(month, weekStart).map((date, cell) => (
              <View key={cell} style={{ width: "14.285714%" }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    date ? formatCalendarDate(date, i18n.language, "long") : undefined
                  }
                  accessibilityElementsHidden={!date}
                  importantForAccessibility={date ? "auto" : "no-hide-descendants"}
                  accessibilityState={{
                    disabled: !date || !enabled.has(date),
                    selected: date === selected,
                  }}
                  disabled={!date || !enabled.has(date)}
                  onPress={() => {
                    if (date && enabled.has(date)) {
                      onPick(date);
                      onClose();
                    }
                  }}
                  className={`h-11 items-center justify-center rounded-full active:opacity-60 ${date === selected ? "bg-default" : ""}`}
                >
                  <Text
                    className={`font-normal text-body tabular-nums ${date && enabled.has(date) ? "text-foreground" : "text-muted opacity-40"}`}
                  >
                    {date ? dayFormat.format(Number(date.slice(-2))) : ""}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Text className="font-normal text-center text-caption text-muted">
            {t("body__photo_dates_hint")}
          </Text>
          <Button variant="tertiary" onPress={onClose}>
            <Button.Label>{t("common__cancel")}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
