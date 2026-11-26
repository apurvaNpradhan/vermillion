import { useForm, useStore } from "@tanstack/react-form";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  BODY_LIMITS,
  dailyWeights,
  kgToLb,
  lbToKg,
  shownWeight,
  trendSeries,
} from "@workspace/shared";
import type { WatchedMeasurement } from "@workspace/sync";
import { useTranslation } from "@/platform/i18n";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { Keypad } from "@/platform/ui/keypad";
import { MeasurementDate } from "@/body/measurements/measurement-date";
import { Button } from "@/platform/ui/button";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { useWeight } from "./use-weight";
import { useLogWeight } from "./use-log-weight";
import { useWeighInGuard } from "./use-weigh-in-guard";
export function WeightLogSheet({
  onClose,
  entry,
  goal,
  onGoal,
}: {
  onClose: () => void;
  entry?: WatchedMeasurement;
  goal?: boolean;
  onGoal?: (value: number | null) => Promise<void>;
}) {
  const state = useWeight();
  const sheet = useSheetPresent();
  const action = useLogWeight();
  const weighIn = useWeighInGuard(state.unit);
  const { t } = useTranslation();
  const [fresh, setFresh] = useState(true);
  const initial = entry?.value ?? (goal ? state.goal : state.trend) ?? 70;
  const form = useForm({
    defaultValues: {
      value: (state.unit === "lb" ? kgToLb(initial) : initial).toFixed(1),
      date: new Date(entry?.measured_at ?? Date.now()).toISOString(),
    },
    onSubmit: async ({ value: fields }) => {
      if (goal && onGoal) {
        if (await action.saveGoal(Number(fields.value), onGoal)) onClose();
        return;
      }
      const save = async () => {
        if (await action.save(Number(fields.value), fields.date, entry)) onClose();
      };
      const entered = Number(fields.value);
      const kg = state.unit === "lb" ? lbToKg(entered) : entered;
      // Editing only the date keeps the weight it had, so there is nothing new to check.
      const unchanged = entry && Math.abs(shownWeight(entry.value, state.unit) - entered) <= 1e-9;
      if (
        unchanged ||
        !Number.isFinite(kg) ||
        kg < BODY_LIMITS.weightMin ||
        kg > BODY_LIMITS.weightMax
      ) {
        await save();
        return;
      }
      const day = state.localDate(fields.date);
      // Backdated readings compare with the trend on that day. An edit cannot justify itself.
      const trendKg =
        !entry && day === state.today
          ? state.trend
          : (trendSeries(
              dailyWeights(
                state.entries.filter((row) => row.id !== entry?.id && row.local_date <= day),
              ),
            ).at(-1)?.trend ?? null);
      if (
        !weighIn.review({
          kg,
          trendKg,
          value: fields.value,
          proceed: () => void save(),
          change: () => setFresh(true),
        })
      )
        await save();
    },
  });
  const { value, date } = useStore(form.store, (s) => s.values);
  const setValue = (next: string | ((current: string) => string)) =>
    form.setFieldValue("value", next);
  const setDate = (next: string) => form.setFieldValue("date", next);
  const step = state.unit === "lb" ? 0.2 : 0.1;
  const save = () => form.handleSubmit();
  return (
    <>
      <BottomSheet
        isOpen={sheet.isOpen}
        onOpenChange={(open) => {
          if (!open && !action.busy) onClose();
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            animationConfigs={SHEET_SPRING}
            backgroundClassName="bg-overlay"
            contentContainerClassName="gap-4 px-4 pb-4"
          >
            {sheet.probe}
            <BottomSheet.Title>{t(goal ? "body__goal" : "body__log")}</BottomSheet.Title>
            <View className="flex-row items-baseline gap-2">
              <Text
                className="font-semibold text-numeric-xl text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {value}
              </Text>
              <Text className="font-normal text-body text-muted">{state.unit}</Text>
            </View>
            {!goal ? (
              <MeasurementDate value={date} timeZone={state.zone} onChange={setDate} />
            ) : null}
            {action.error ? (
              <Text accessibilityRole="alert" className="font-normal text-body text-danger">
                {action.error}
              </Text>
            ) : null}
            <Button isDisabled={action.busy} onPress={() => void save()}>
              <Button.Label>{t("body__save")}</Button.Label>
            </Button>
            {entry && !goal ? (
              <Button
                variant="danger-soft"
                isDisabled={action.busy}
                onPress={() => void action.remove(entry).then(onClose)}
              >
                <Button.Label>{t("body__delete")}</Button.Label>
              </Button>
            ) : null}
            {goal && onGoal ? (
              <Button
                variant="tertiary"
                isDisabled={action.busy}
                onPress={() =>
                  void action.clearGoal(onGoal).then((ok) => {
                    if (ok) onClose();
                  })
                }
              >
                <Button.Label>{t("body__clear_goal")}</Button.Label>
              </Button>
            ) : null}
            <Keypad
              allowPoint
              hasNext={false}
              stepText={String(step)}
              labels={{
                point: t("session__key_point"),
                backspace: t("session__key_backspace"),
                decrease: t("session__key_decrease", { step }),
                increase: t("session__key_increase", { step }),
                next: t("session__key_next"),
                done: t("body__save"),
              }}
              onKey={(key) => {
                setValue((current) =>
                  key === "backspace"
                    ? current.slice(0, -1)
                    : key === "."
                      ? current.includes(".") && !fresh
                        ? current
                        : (fresh ? "0" : current) + "."
                      : (fresh ? "" : current) + key,
                );
                setFresh(false);
              }}
              onStep={(direction) => {
                setValue((Number(value) + direction * step).toFixed(1));
                setFresh(true);
              }}
              onNext={() => undefined}
              onDone={() => void save()}
            />
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      {weighIn.dialog}
    </>
  );
}
