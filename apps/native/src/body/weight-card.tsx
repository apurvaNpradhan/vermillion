import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatWeight } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Sparkline } from "@/platform/ui/charts/sparkline";
import { useWeight } from "./use-weight";
import { WeightLogSheet } from "./weight-log-sheet";
export function WeightCard() {
  const state = useWeight();
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-3 border-b border-separator pb-5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("body__title")}
        onPress={() => router.push("/body/weight")}
        className="gap-2"
      >
        <Text className="text-caption text-muted">{t("body__title")}</Text>
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-title-xl font-semibold text-foreground">
            {state.loading
              ? t("common__loading")
              : state.trend === null
                ? t("body__empty")
                : t("body__value", {
                    value: formatWeight(state.trend, state.unit),
                    unit: state.unit,
                  })}
          </Text>
          <Sparkline values={state.series.slice(-30).map((p) => p.trend)} />
        </View>
        {state.change !== null ? (
          <Text className="text-caption text-muted">
            {t("body__month_change", {
              value: formatWeight(state.change, state.unit),
              unit: state.unit,
            })}
          </Text>
        ) : null}
      </Pressable>
      {state.failed ? (
        <Button variant="tertiary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : (
        <Button variant="secondary" onPress={() => setOpen(true)}>
          <Button.Label>{t("body__log")}</Button.Label>
        </Button>
      )}
      {open ? <WeightLogSheet onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
