import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Stepper } from "@/training";

import {
  notAfter,
  onDay,
  recentDays,
  sameDay,
  splitDuration,
  stepDuration,
  stepStart,
} from "../save-time";
import { SheetShell } from "./sheet-shell";

/** How many days back the date sheet offers, today included. */
const DAYS = 15;

/** Hours and minutes of the workout's length, in two steppers. */
export function DurationSheet({
  isOpen,
  onOpenChange,
  seconds,
  maxSeconds,
  onChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  seconds: number;
  maxSeconds: number;
  onChange: (seconds: number) => void;
}) {
  const { t } = useTranslation();
  const { hours, minutes } = splitDuration(seconds);
  return (
    <SheetShell isOpen={isOpen} onOpenChange={onOpenChange} title={t("session__stat_duration")}>
      <View className="gap-3">
        <Stepper
          label={t("session__hours")}
          valueText={t("session__hours_value", { count: hours })}
          decrementLabel={t("session__hours_less")}
          incrementLabel={t("session__hours_more")}
          canDecrement={seconds >= 3600}
          canIncrement={seconds + 3600 <= maxSeconds}
          onStep={(direction) => onChange(stepDuration(seconds, "hour", direction, maxSeconds))}
        />
        <Stepper
          label={t("session__minutes")}
          valueText={t("session__minutes_value", { count: minutes })}
          decrementLabel={t("session__minutes_less")}
          incrementLabel={t("session__minutes_more")}
          canDecrement={seconds >= 60}
          canIncrement={seconds + 60 <= maxSeconds}
          onStep={(direction) => onChange(stepDuration(seconds, "minute", direction, maxSeconds))}
        />
      </View>
      <Button onPress={() => onOpenChange(false)}>
        <Button.Label>{t("session__done")}</Button.Label>
      </Button>
    </SheetShell>
  );
}

/**
 * The day (today and the last two weeks, as chips) and the time of day (hour and minute
 * steppers) a workout started. The start is never later than now.
 */
export function DateSheet({
  isOpen,
  onOpenChange,
  startedAt,
  now,
  language,
  onChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  startedAt: Date;
  now: Date;
  language: string;
  onChange: (startedAt: Date) => void;
}) {
  const { t } = useTranslation();
  const time = new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const days = recentDays(now, DAYS);
  const yesterday = days[1];
  return (
    <SheetShell isOpen={isOpen} onOpenChange={onOpenChange} title={t("session__date_title")}>
      <View className="flex-row flex-wrap gap-2">
        {days.map((value, index) => {
          const selected = sameDay(value, startedAt);
          return (
            <Pressable
              key={value.getTime()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(notAfter(onDay(startedAt, value), now))}
              className={
                selected
                  ? "min-h-11 justify-center rounded-xl bg-default px-3"
                  : "min-h-11 justify-center rounded-xl border border-separator px-3"
              }
            >
              <Text className="text-body text-foreground">
                {index === 0
                  ? t("session__today")
                  : yesterday && index === 1
                    ? t("session__yesterday")
                    : day.format(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-body text-muted tabular-nums">{time.format(startedAt)}</Text>
      <View className="gap-3">
        <Stepper
          label={t("session__hour")}
          valueText={String(startedAt.getHours()).padStart(2, "0")}
          decrementLabel={t("session__hour_earlier")}
          incrementLabel={t("session__hour_later")}
          canIncrement={startedAt.getTime() + 3_600_000 <= now.getTime()}
          onStep={(direction) => onChange(stepStart(startedAt, "hour", direction, now))}
        />
        <Stepper
          label={t("session__minute")}
          valueText={String(startedAt.getMinutes()).padStart(2, "0")}
          decrementLabel={t("session__minute_earlier")}
          incrementLabel={t("session__minute_later")}
          canIncrement={startedAt.getTime() + 60_000 <= now.getTime()}
          onStep={(direction) => onChange(stepStart(startedAt, "minute", direction, now))}
        />
      </View>
      <Button onPress={() => onOpenChange(false)}>
        <Button.Label>{t("session__done")}</Button.Label>
      </Button>
    </SheetShell>
  );
}
