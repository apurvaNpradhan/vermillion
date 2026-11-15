import { Switch } from "heroui-native";
import { BODY_GROUPS } from "@workspace/shared";
import { Text, View } from "react-native";
import { usePreferences } from "@/preferences";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { ListSection, ListRow } from "@/platform/ui/list";
import { groupLabels, metricLabels } from "./metric-labels";
import { HeightRow } from "./height-row";
export function TrackedMetricsScreen() {
  const { preferences, setUi, isSaving, isLoading } = usePreferences();
  const { t } = useTranslation();
  return (
    <ScrollPage back title={t("body__tracked_metrics")}>
      {Object.entries(BODY_GROUPS).map(([group, metrics]) => (
        <ListSection
          key={group}
          title={t(groupLabels[group === "upper" ? "upper" : group === "arms" ? "arms" : "legs"])}
        >
          {metrics.map((metric) => (
            <View
              key={metric}
              className="flex-row items-center justify-between gap-4 border-b border-separator py-4"
            >
              <Text className="flex-1 text-body text-foreground">{t(metricLabels[metric])}</Text>
              <Switch
                accessibilityLabel={t(metricLabels[metric])}
                isDisabled={isSaving || isLoading}
                isSelected={preferences.ui.trackedMetrics.includes(metric)}
                onSelectedChange={(selected) =>
                  setUi({
                    trackedMetrics: selected
                      ? [...new Set([...preferences.ui.trackedMetrics, metric])]
                      : preferences.ui.trackedMetrics.filter((m) => m !== metric),
                  })
                }
              />
            </View>
          ))}
        </ListSection>
      ))}
      <ListSection>
        <HeightRow />
        <ListRow
          title={t("body__length_unit")}
          value={preferences.ui.lengthUnit}
          onPress={() => setUi({ lengthUnit: preferences.ui.lengthUnit === "cm" ? "in" : "cm" })}
        />
      </ListSection>
    </ScrollPage>
  );
}
