import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatBodyValue, formatBodyWeight, lastN } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useWeight } from "./use-weight";
import { useMeasurements } from "./use-measurements";

export function BodyCard() {
  const weight = useWeight();
  const measurements = useMeasurements();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const waist = lastN(measurements.forMetric("waist"), 1)[0];
  const loading = weight.loading || measurements.loading;
  const failed = weight.failed || measurements.failed;
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text className="text-title-md font-semibold text-foreground">{t("body__title")}</Text>
      {failed ? (
        <Button
          variant="tertiary"
          onPress={() => {
            weight.retry();
            measurements.retry();
          }}
        >
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : loading ? (
        <Text className="text-body text-muted">{t("common__loading")}</Text>
      ) : (
        <View className="flex-row gap-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/body/weight")}
            className="flex-1 gap-1 rounded-xl py-2 active:bg-default"
          >
            <Text className="text-caption text-muted">{t("body__trend_now")}</Text>
            <Text className="text-numeric-md tabular-nums text-foreground">
              {weight.trend === null
                ? t("body__no_data")
                : t("body__value", {
                    value: formatBodyWeight(weight.trend, weight.unit, i18n.language),
                    unit: weight.unit,
                  })}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/body/measurements")}
            className="flex-1 gap-1 rounded-xl py-2 active:bg-default"
          >
            <Text className="text-caption text-muted">{t("body__compare_waist")}</Text>
            <Text className="text-numeric-md tabular-nums text-foreground">
              {waist
                ? t("body__value", {
                    value: formatBodyValue(
                      measurements.display("waist", waist.value),
                      i18n.language,
                    ),
                    unit: measurements.unit("waist"),
                  })
                : t("body__no_data")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
