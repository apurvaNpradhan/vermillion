import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ShareComposer, type ShareTemplate, type ShareToggle } from "@/share";

import { ReportMusclesCard, ReportSummaryCard, type ReportToggleId } from "./report-cards";
import { parseReportKey, type ReportPeriod } from "./report-period";
import { buildReportView } from "./report-view";
import { usePeriodReport } from "./use-period-report";
import { useReportLabels } from "./use-report-labels";

function Status({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  if (loading) return <View className="flex-1 bg-background" />;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-center text-body text-muted">{t("session__load_failed")}</Text>
      <Button variant="secondary" onPress={onClose}>
        <Button.Label>{t("share__close")}</Button.Label>
      </Button>
    </View>
  );
}

function ReportShare({ period, onClose }: { period: ReportPeriod; onClose: () => void }) {
  const { t } = useTranslation();
  const state = usePeriodReport(period);
  const { labels, title, kicker } = useReportLabels(period);
  if (state.status !== "ready")
    return <Status loading={state.status === "loading"} onClose={onClose} />;
  const data = {
    kicker,
    title,
    view: buildReportView(state.report, labels),
    shares: state.report.shares,
  };
  const templates: ShareTemplate<ReportToggleId>[] = [
    {
      id: "summary",
      label: t("share__template_summary"),
      supportsTransparent: false,
      render: (context) => <ReportSummaryCard data={data} context={context} />,
    },
    ...(state.report.shares.groups.length > 0
      ? [
          {
            id: "muscles",
            label: t("share__template_muscles"),
            supportsTransparent: false,
            render: (context) => <ReportMusclesCard data={data} context={context} />,
          } satisfies ShareTemplate<ReportToggleId>,
        ]
      : []),
  ];
  const toggles: ShareToggle<ReportToggleId>[] = [
    { id: "weights", label: t("share__toggle_weights"), defaultOn: true, remember: true },
  ];
  return (
    <ShareComposer
      kind="report"
      title={t("share__title_report")}
      templates={templates}
      toggles={toggles}
    />
  );
}

/** The Share composer for a month or year report (route `share/report/[id]`, id like `2026-10`). */
export function ReportShareScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const period = parseReportKey(id);
  return period ? (
    <ReportShare period={period} onClose={onClose} />
  ) : (
    <Status loading={false} onClose={onClose} />
  );
}
