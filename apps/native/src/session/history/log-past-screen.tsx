import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { calendarDay, sessionStartAllowed, stepZoned, zonedParts } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Calendar } from "@/platform/ui/calendar";
import { calendarMonth } from "@/platform/ui/calendar-math";
import { Page } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { Stepper, useWorkouts } from "@/training";
import { useFinishSession } from "@/session/finish/use-finish-session";

import { logPastBounds, logPastOnDay } from "./log-past-date";

export function LogPastScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const library = useWorkouts(true);
  const actions = useFinishSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shownMonth, setShownMonth] = useState<number | null>(null);
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bounds = logPastBounds(new Date(), timezone);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, { timeZone: "UTC", ...options }).format;
  const timeDigits = new Intl.NumberFormat(i18n.language, { minimumIntegerDigits: 2 });
  const form = useForm({
    defaultValues: { startedAt: new Date().toISOString() },
    onSubmit: async ({ value }) => {
      const parsed = Date.parse(value.startedAt);
      if (!Number.isFinite(parsed) || !sessionStartAllowed(new Date(parsed).toISOString())) {
        setInvalid(true);
        return;
      }
      setBusy(true);
      try {
        const id = await actions.logPast(selected, new Date(parsed).toISOString());
        if (id) router.replace({ pathname: "/session/[id]", params: { id, backfill: "true" } });
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <Page title={t("session__log_past")} back>
      {({ header, contentContainerStyle, ...scroll }) => (
        <Animated.ScrollView
          {...scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16, gap: 16 }}
        >
          {header}
          <Button
            variant={selected === null ? "secondary" : "ghost"}
            onPress={() => setSelected(null)}
          >
            <Button.Label>{t("session__start_empty")}</Button.Label>
          </Button>
          {library.workouts.map((workout) => (
            <Button
              key={workout.id}
              variant={selected === workout.id ? "secondary" : "ghost"}
              onPress={() => setSelected(workout.id)}
            >
              <Button.Label>{workout.title ?? t("session__source_workout")}</Button.Label>
            </Button>
          ))}
          <form.Field name="startedAt">
            {(field) => {
              const start = field.state.value;
              const selectedDay = calendarDay(start, timezone);
              const parts = zonedParts(start, timezone);
              const select = (day: number) => {
                field.handleChange(logPastOnDay(start, day, timezone, bounds));
                setInvalid(false);
              };
              const stepped = (part: "hour" | "minute", direction: -1 | 1) =>
                stepZoned(start, timezone, part, direction);
              const canStep = (value: string) => {
                const timestamp = Date.parse(value);
                return timestamp >= bounds.earliest && timestamp <= bounds.latest;
              };
              return (
                <View className="gap-3">
                  <Text
                    accessibilityRole="header"
                    className="text-title-md font-semibold text-foreground"
                  >
                    {t("session__date_title")}
                  </Text>
                  <Calendar
                    month={shownMonth ?? calendarMonth(selectedDay)}
                    selected={selectedDay}
                    min={bounds.min}
                    today={bounds.today}
                    weekStart={preferences.ui.weekStart}
                    labels={{
                      month: format({ month: "long", year: "numeric" }),
                      weekday: format({ weekday: "narrow" }),
                      day: format({ day: "numeric" }),
                      date: format({ dateStyle: "full" }),
                      previous: t("session__month_previous"),
                      next: t("session__month_next"),
                    }}
                    onSelect={select}
                    onMonthChange={setShownMonth}
                  />
                  {(["hour", "minute"] as const).map((part) => (
                    <View key={part} className="gap-1">
                      <Text className="text-caption text-muted">{t(`session__${part}`)}</Text>
                      <Stepper
                        label={t(`session__${part}`)}
                        valueText={timeDigits.format(parts[part])}
                        decrementLabel={t(`session__${part}_earlier`)}
                        incrementLabel={t(`session__${part}_later`)}
                        canDecrement={canStep(stepped(part, -1))}
                        canIncrement={canStep(stepped(part, 1))}
                        onStep={(direction) => {
                          const next = stepped(part, direction);
                          if (!canStep(next)) return;
                          field.handleChange(next);
                          setShownMonth(calendarMonth(calendarDay(next, timezone)));
                          setInvalid(false);
                        }}
                      />
                    </View>
                  ))}
                </View>
              );
            }}
          </form.Field>
          {invalid ? (
            <Text className="text-body text-danger">{t("session__invalid_start_date")}</Text>
          ) : null}
          <Button isDisabled={busy} onPress={() => void form.handleSubmit()}>
            <Button.Label>{t("session__log_past")}</Button.Label>
          </Button>
        </Animated.ScrollView>
      )}
    </Page>
  );
}
