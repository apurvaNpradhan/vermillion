import { BodyState } from "@/body/body-state";
import { Switch } from "heroui-native";
import { BODY_GROUPS } from "@workspace/shared";
import { usePreferences } from "@/preferences";
import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";
import { ListSection, ListRow } from "@/platform/ui/list";
import { groupLabels, metricLabels } from "./metric-labels";
import { HeightRow } from "@/body/weight/height-row";
export function TrackedMetricsScreen() {
  const { preferences, setUi, isSaving, isLoading, hasPreferences } = usePreferences();
  const { t } = useTranslation();
  if (isLoading || !hasPreferences)
    return (
      <ScrollPage back title={t("body__tracked_metrics")}>
        <BodyState loading={isLoading} failed={!isLoading && !hasPreferences} />
      </ScrollPage>
    );
  return (
    <ScrollPage back title={t("body__tracked_metrics")}>
      {Object.entries(BODY_GROUPS).map(([group, metrics]) => (
        <ListSection
          key={group}
          title={t(groupLabels[group === "upper" ? "upper" : group === "arms" ? "arms" : "legs"])}
        >
          {metrics.map((metric) => {
            const selected = preferences.ui.trackedMetrics.includes(metric);
            const toggle = (next: boolean) =>
              setUi({
                trackedMetrics: next
                  ? [...new Set([...preferences.ui.trackedMetrics, metric])]
                  : preferences.ui.trackedMetrics.filter((m) => m !== metric),
              });
            return (
              <ListRow
                key={metric}
                title={t(metricLabels[metric])}
                accessory="none"
                checked={selected}
                disabled={isSaving || isLoading}
                onPress={() => toggle(!selected)}
                trailing={
                  <Switch
                    isDisabled={isSaving || isLoading}
                    isSelected={selected}
                    onSelectedChange={toggle}
                  />
                }
              />
            );
          })}
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
